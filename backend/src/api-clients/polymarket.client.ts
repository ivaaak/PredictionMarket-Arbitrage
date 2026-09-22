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
import { SweepBatch } from '../types/ingestion';
import { QualityTally } from './market-quality';

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
    liquidityNum?: number | string;
    liquidity?: number | string;
    endDate?: string;
    enableOrderBook?: boolean;
    acceptingOrders?: boolean;
    closed?: boolean;
    events?: { title?: string }[];
}

// Gamma silently caps `limit` at 100, so asking for more just returns 100.
const PAGE_SIZE = 100;
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

const CERT_ERROR_CODES = new Set([
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID'
]);

/**
 * fetch() hides the real reason in `cause`. A certificate error here almost
 * always means the network is not reaching Polymarket at all: some ISPs answer
 * blocked domains with their own server and a self-signed certificate. Say so
 * instead of printing a stack trace every poll.
 */
function describeFetchError(error: unknown): string {
    const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
    if (cause?.code && CERT_ERROR_CODES.has(cause.code)) {
        return `TLS certificate rejected (${cause.code}) for ${POLYMARKET_GAMMA_API_BASE}. ` +
            'Your network is likely intercepting or blocking Polymarket (e.g. an ISP block page). ' +
            'Check with: nslookup gamma-api.polymarket.com';
    }
    if (cause?.message) return `${(error as Error).message}: ${cause.message}`;
    return error instanceof Error ? error.message : String(error);
}

export class PolymarketPollingClient {
    private pollingInterval: NodeJS.Timeout | null = null;
    private isPollInFlight = false;

    constructor(
        private readonly onBatch: (sweep: SweepBatch) => Promise<void>,
        private readonly intervalMs: number,
        private readonly maxPages: number,
        private readonly onError?: (message: string) => void
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

    private async fetchAllMarkets(): Promise<SweepBatch> {
        const nowMs = Date.now();
        const now = Math.floor(nowMs / 1000);
        const markets: MarketData[] = [];
        const seen = new Set<string>();
        const tally = new QualityTally();
        let complete = false;

        let offset = 0;
        for (let page = 0; page < this.maxPages; page++) {
            const rows = await this.fetchPage(offset);
            // Stop on an empty page rather than a short one: the server's page
            // cap is not ours to assume.
            if (rows.length === 0) {
                complete = true;
                break;
            }
            offset += rows.length;

            for (const row of rows) {
                if (row.closed || row.enableOrderBook === false || row.acceptingOrders === false) continue;
                const mapped = toMarketData(row, now);
                // Offset pagination over a live, re-sorting list can repeat rows.
                if (!mapped || seen.has(mapped.ticker)) continue;
                seen.add(mapped.ticker);
                if (tally.admit(mapped, { liquidity: num(row.liquidityNum) ?? num(row.liquidity) }, nowMs)) {
                    markets.push(mapped);
                }
            }

            await sleep(PAGE_DELAY_MS);
        }

        console.log(chalk.blue.bold('[POLYMARKET]'), chalk.gray(`Quality filter: ${tally.describe()}${complete ? '' : ' (stopped at page cap)'}`));
        return { markets, rejected: tally.rejected as Record<string, number>, complete };
    }

    private async poll() {
        if (this.isPollInFlight) {
            console.log(chalk.blue.bold('[POLYMARKET]'), chalk.yellow('Previous poll still running, skipping this tick'));
            return;
        }
        this.isPollInFlight = true;

        try {
            const sweep = await this.fetchAllMarkets();
            console.log(chalk.blue.bold('[POLYMARKET]'), chalk.green(`Fetched ${sweep.markets.length} tradable open binary markets`));
            await this.onBatch(sweep);
        } catch (error) {
            console.error(chalk.blue.bold('[POLYMARKET]'), chalk.red('Poll failed:'), describeFetchError(error));
            this.onError?.(describeFetchError(error));
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

    public isPolling(): boolean {
        return this.pollingInterval !== null;
    }
}
