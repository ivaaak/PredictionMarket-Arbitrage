import chalk from 'chalk';
import { KALSHI_API_BASE } from '../config';
import { MarketData } from '../database/postgres.client';

// Kalshi quotes every price as a fixed-point dollar string ("0.4200") and
// every size/volume as a fixed-point string ("118844.56"). The legacy integer
// cent fields (last_price, yes_bid, volume, ...) are no longer returned.
interface KalshiMarket {
    ticker: string;
    event_ticker: string;
    market_type?: string;
    status?: string;
    title: string;
    yes_sub_title?: string;
    rules_primary?: string;
    close_time?: string;
    last_price_dollars?: string;
    yes_bid_dollars?: string;
    yes_ask_dollars?: string;
    no_bid_dollars?: string;
    no_ask_dollars?: string;
    volume_fp?: string;
}

interface KalshiEvent {
    event_ticker: string;
    title: string;
    markets?: KalshiMarket[];
}

interface KalshiEventsResponse {
    events: KalshiEvent[];
    cursor?: string;
}

const PAGE_SIZE = 200;
// Kalshi's basic tier allows ~20 reads/second; stay well under it.
const PAGE_DELAY_MS = 150;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parseDollars(value?: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * A bid of 0 or an ask of 1 is how Kalshi reports an empty side of the book.
 */
function bidOrNull(value?: string): number | null {
    const n = parseDollars(value);
    return n !== null && n > 0 ? n : null;
}

function askOrNull(value?: string): number | null {
    const n = parseDollars(value);
    return n !== null && n > 0 && n < 1 ? n : null;
}

export function toMarketData(event: KalshiEvent, market: KalshiMarket, now: number): MarketData {
    const yesBid = bidOrNull(market.yes_bid_dollars);
    const yesAsk = askOrNull(market.yes_ask_dollars);
    const last = parseDollars(market.last_price_dollars) ?? 0;

    return {
        ticker: market.ticker,
        source: 'Kalshi_Polling',
        price: yesBid !== null && yesAsk !== null ? (yesBid + yesAsk) / 2 : last,
        volume: parseDollars(market.volume_fp) ?? 0,
        timestamp: now,
        title: market.title,
        // In multi-market events (e.g. "Fed decision" -> one market per rate)
        // the market title alone is ambiguous; yes_sub_title names the outcome.
        subtitle: market.yes_sub_title || undefined,
        event_title: event.title,
        yes_bid: yesBid,
        yes_ask: yesAsk,
        no_bid: bidOrNull(market.no_bid_dollars),
        no_ask: askOrNull(market.no_ask_dollars),
        close_time: market.close_time || null,
        rules: market.rules_primary || null
    };
}

/**
 * Polls the full catalogue of open Kalshi events (with their markets) and hands
 * each sweep to the callback as one batch.
 */
export class KalshiPollingClient {
    private baseUrl = KALSHI_API_BASE;
    private pollingInterval: NodeJS.Timeout | null = null;
    // Guards against overlapping polls when a sweep outruns the interval.
    private isPollInFlight = false;

    constructor(
        private readonly onBatch: (markets: MarketData[]) => Promise<void>,
        private readonly intervalMs: number,
        private readonly maxPages: number,
        private readonly onError?: (message: string) => void
    ) {}

    private async fetchPage(cursor?: string): Promise<KalshiEventsResponse> {
        const params = new URLSearchParams({
            status: 'open',
            with_nested_markets: 'true',
            limit: String(PAGE_SIZE)
        });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(`${this.baseUrl}/events?${params}`);
        if (!response.ok) {
            throw new Error(`Kalshi /events returned ${response.status}`);
        }
        return response.json() as Promise<KalshiEventsResponse>;
    }

    private async fetchAllMarkets(): Promise<MarketData[]> {
        const now = Math.floor(Date.now() / 1000);
        const markets: MarketData[] = [];
        let cursor: string | undefined;

        for (let page = 0; page < this.maxPages; page++) {
            const data = await this.fetchPage(cursor);

            for (const event of data.events || []) {
                for (const market of event.markets || []) {
                    if (market.market_type && market.market_type !== 'binary') continue;
                    if (market.status && market.status !== 'active') continue;
                    markets.push(toMarketData(event, market, now));
                }
            }

            cursor = data.cursor || undefined;
            if (!cursor) break;
            await sleep(PAGE_DELAY_MS);
        }

        return markets;
    }

    private async poll() {
        if (this.isPollInFlight) {
            console.log(chalk.red.bold('[KALSHI-POLLING]'), chalk.yellow('Previous poll still running, skipping this tick'));
            return;
        }
        this.isPollInFlight = true;

        try {
            const markets = await this.fetchAllMarkets();
            console.log(chalk.red.bold('[KALSHI-POLLING]'), chalk.green(`Fetched ${markets.length} open markets`));
            await this.onBatch(markets);
        } catch (error) {
            console.error(chalk.red.bold('[KALSHI-POLLING]'), chalk.red('Poll failed:'), error);
            this.onError?.(error instanceof Error ? error.message : String(error));
        } finally {
            this.isPollInFlight = false;
        }
    }

    public startPolling() {
        console.log(
            chalk.red.bold('[KALSHI-POLLING]'),
            chalk.cyan(`Starting polling every ${this.intervalMs / 1000} seconds`)
        );

        this.poll();
        this.pollingInterval = setInterval(() => this.poll(), this.intervalMs);
    }

    public stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log(chalk.red.bold('[KALSHI-POLLING]'), chalk.green('Polling stopped'));
        }
    }

    public isPolling(): boolean {
        return this.pollingInterval !== null;
    }
}
