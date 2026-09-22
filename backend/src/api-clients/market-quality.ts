// src/api-clients/market-quality.ts
//
// Ingest-time filter: only markets that could take part in an arbitrage are
// stored. An arbitrage buys YES on one venue and NO on the other at the ask, so
// a market is useless to the matcher if nothing can be bought on it, if nobody
// has ever traded or held it, if its book is so wide the quote is meaningless,
// or if it has already closed. Kalshi alone lists ~100k auto-generated strike
// and parlay markets, most of which fail these checks; storing them only slows
// every query and floods the LLM matcher with candidates nobody can trade.
import {
    INGEST_MAX_SPREAD,
    INGEST_MIN_BOOK_DEPTH,
    INGEST_MIN_POLYMARKET_LIQUIDITY,
    INGEST_MIN_VOLUME
} from '../config';
import { MarketData } from '../database/postgres.client';

export type RejectReason =
    | 'expired'       // close time already passed
    | 'no_quote'      // neither YES nor NO can be bought (no ask on either side)
    | 'no_depth'      // quotes exist but with no size / venue reports no liquidity
    | 'no_activity'   // never traded (and, on Kalshi, nobody holds a position)
    | 'wide_spread';  // YES bid/ask so far apart the price is not informative

/** Venue-specific signals that are not stored on the row itself. */
export interface QualitySignals {
    /** Contracts resting at the best YES ask + best YES bid (Kalshi). */
    bookDepth?: number | null;
    /** Contracts currently held (Kalshi). */
    openInterest?: number | null;
    /** Venue-reported order-book liquidity in dollars (Polymarket). */
    liquidity?: number | null;
}

export function rejectReason(market: MarketData, signals: QualitySignals = {}, nowMs = Date.now()): RejectReason | null {
    if (market.close_time && new Date(market.close_time).getTime() <= nowMs) return 'expired';

    if (market.yes_ask == null && market.no_ask == null) return 'no_quote';

    if (signals.bookDepth != null && signals.bookDepth < INGEST_MIN_BOOK_DEPTH) return 'no_depth';
    if (signals.liquidity != null && signals.liquidity < INGEST_MIN_POLYMARKET_LIQUIDITY) return 'no_depth';

    const traded = market.volume >= INGEST_MIN_VOLUME;
    const held = (signals.openInterest ?? 0) > 0;
    if (!traded && !held) return 'no_activity';

    if (market.yes_bid != null && market.yes_ask != null && market.yes_ask - market.yes_bid > INGEST_MAX_SPREAD) {
        return 'wide_spread';
    }

    return null;
}

/** Counts kept and rejected markets over one sweep, for logs and the UI. */
export class QualityTally {
    kept = 0;
    rejected: Partial<Record<RejectReason, number>> = {};

    /** Returns true when the market should be stored. */
    admit(market: MarketData, signals?: QualitySignals, nowMs?: number): boolean {
        const reason = rejectReason(market, signals, nowMs);
        if (reason) {
            this.rejected[reason] = (this.rejected[reason] ?? 0) + 1;
            return false;
        }
        this.kept += 1;
        return true;
    }

    get rejectedTotal(): number {
        return Object.values(this.rejected).reduce((a, b) => a + (b ?? 0), 0);
    }

    describe(): string {
        const parts = Object.entries(this.rejected).map(([r, n]) => `${r} ${n}`);
        return `kept ${this.kept}, dropped ${this.rejectedTotal}${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }
}
