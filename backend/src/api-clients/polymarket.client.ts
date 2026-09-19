// src/api-clients/polymarket.client.ts
//
// Polls Polymarket's Gamma API for the catalogue of open markets.
//
// This replaced a subscription to the public trade feed. A trade message
// carries the price of whichever outcome (YES or NO) was traded, so keying rows
// by market meant the stored price flipped between p and 1-p, only markets that
// happened to trade were ever seen, and there was no order book to price an
// arbitrage from. Gamma returns one row per market with the current YES book.

import chalk from 'chalk';
import { POLYMARKET_GAMMA_API_BASE } from '../config';
import { MarketData } from '../database/postgres.client';

// Gamma encodes array fields as JSON strings and numeric fields inconsistently
// (some as numbers, some as strings), so everything is parsed defensively.
interface GammaMarket {
    conditionId?: string;
    question?: string;
    description?: string;
    outcomes?: string;
    outcomePrices?: string;
    bestBid?: number | string;
    bestAsk?: number | string;
    lastTradePrice?: number | string;
    volumeNum?: number | string;
    volume?: number | string;
    endDate?: string;
    enableOrderBook?: boolean;
    acceptingOrders?: boolean;
    closed?: boolean;
    events?: { title?: string }[];
}

const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 200;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function num(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : null;
}

function parseJsonArray(value?: string): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

const inOpenUnitInterval = (n: number | null): n is number => n !== null && n > 0 && n < 1;

/**
 * Maps a Gamma market onto the shared row shape, or returns null for markets
 * that cannot be priced as a binary contract.
 *
 * YES is the market's first outcome. For Yes/No markets that is "Yes"; for
 * two-sided markets ("Lakers" vs "Celtics") it is the first name, which is
 * stored in `outcome` so the matcher knows what YES means.
 *
 * Gamma's bestBid/bestAsk are for the first outcome's token. Polymarket's CLOB
 * matches a NO buy against a YES sell, so NO's ask is 1 - YES bid and NO's bid
 * is 1 - YES ask.
 */
export function toMarketData(market: GammaMarket, now: number): MarketData | null {
    const outcomes = parseJsonArray(market.outcomes);
    if (!market.conditionId || outcomes.length !== 2) return null;

    const outcomePrices = parseJsonArray(market.outcomePrices).map(num);
    const yesBidRaw = num(market.bestBid);
    const yesAskRaw = num(market.bestAsk);
    const yesBid = inOpenUnitInterval(yesBidRaw) ? yesBidRaw : null;
    const yesAsk = inOpenUnitInterval(yesAskRaw) ? yesAskRaw : null;

    const price = outcomePrices[0] ?? num(market.lastTradePrice) ?? (
        yesBid !== null && yesAsk !== null ? (yesBid + yesAsk) / 2 : null
    );
    if (price === null) return null;

    return {
        ticker: market.conditionId,
        source: 'Polymarket_Gamma',
        price,
        volume: num(market.volumeNum) ?? num(market.volume) ?? 0,
        timestamp: now,
        title: market.question,
        outcome: outcomes[0],
        event_title: market.events?.[0]?.title || null,
        yes_bid: yesBid,
        yes_ask: yesAsk,
        no_bid: yesAsk !== null ? 1 - yesAsk : null,
        no_ask: yesBid !== null ? 1 - yesBid : null,
        close_time: market.endDate || null,
        rules: market.description || null
    };
}

export class PolymarketPollingClient {
    private pollingInterval: NodeJS.Timeout | null = null;
    private isPollInFlight = false;

    constructor(
        private readonly onBatch: (markets: MarketData[]) => Promise<void>,
        private readonly intervalMs: number,
        private readonly maxPages: number
    ) {}

    // Sorting by volume makes the page cap keep the most liquid markets. If the
    // API ever rejects the sort field, fall back to unsorted rather than
    // stopping ingestion altogether.
    private sortByVolume = true;

    private async fetchPage(offset: number): Promise<GammaMarket[]> {
        const params = new URLSearchParams({
            active: 'true',
            closed: 'false',
            archived: 'false',
            limit: String(PAGE_SIZE),
            offset: String(offset)
        });
        if (this.sortByVolume) {
            params.set('order', 'volumeNum');
            params.set('ascending', 'false');
        }

        const response = await fetch(`${POLYMARKET_GAMMA_API_BASE}/markets?${params}`);
        if (response.status >= 400 && response.status < 500 && this.sortByVolume) {
            console.warn(chalk.blue.bold('[POLYMARKET]'), chalk.yellow(`Sorted query rejected (${response.status}); retrying unsorted`));
            this.sortByVolume = false;
            return this.fetchPage(offset);
        }
        if (!response.ok) {
            throw new Error(`Polymarket Gamma /markets returned ${response.status}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    private async fetchAllMarkets(): Promise<MarketData[]> {
        const now = Math.floor(Date.now() / 1000);
        const markets: MarketData[] = [];
        const seen = new Set<string>();

        for (let page = 0; page < this.maxPages; page++) {
            const rows = await this.fetchPage(page * PAGE_SIZE);

            for (const row of rows) {
                if (row.closed || row.enableOrderBook === false || row.acceptingOrders === false) continue;
                const mapped = toMarketData(row, now);
                // Offset pagination over a live, re-sorting list can repeat rows.
                if (mapped && !seen.has(mapped.ticker)) {
                    seen.add(mapped.ticker);
                    markets.push(mapped);
                }
            }

            if (rows.length < PAGE_SIZE) break;
            await sleep(PAGE_DELAY_MS);
        }

        return markets;
    }

    private async poll() {
        if (this.isPollInFlight) {
            console.log(chalk.blue.bold('[POLYMARKET]'), chalk.yellow('Previous poll still running, skipping this tick'));
            return;
        }
        this.isPollInFlight = true;

        try {
            const markets = await this.fetchAllMarkets();
            console.log(chalk.blue.bold('[POLYMARKET]'), chalk.green(`Fetched ${markets.length} open binary markets`));
            await this.onBatch(markets);
        } catch (error) {
            console.error(chalk.blue.bold('[POLYMARKET]'), chalk.red('Poll failed:'), error);
        } finally {
            this.isPollInFlight = false;
        }
    }

    public startPolling(): void {
        console.log(chalk.blue.bold('[POLYMARKET]'), chalk.cyan(`Starting polling every ${this.intervalMs / 1000} seconds`));
        this.poll();
        this.pollingInterval = setInterval(() => this.poll(), this.intervalMs);
    }

    public stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log(chalk.blue.bold('[POLYMARKET]'), chalk.green('Polling stopped'));
        }
    }
}
