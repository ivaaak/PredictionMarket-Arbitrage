import { KalshiDataRecord } from "./kalshiDataRecord";
import { PolymarketDataRecord } from "./polymarketDataRecord";
import { ArbitrageQuote } from "./arbitrage";

/**
 * "same": Polymarket YES and Kalshi YES pay out in the same world.
 * "inverted": Polymarket YES pays out exactly when Kalshi NO does.
 */
export type MatchDirection = 'same' | 'inverted';

export interface MarketMatch {
    polymarketRecord: PolymarketDataRecord;
    kalshiRecord: KalshiDataRecord;
    similarity: 'exact' | 'high' | 'medium' | 'low';
    direction: MatchDirection;
    confidence: number;
    reasoning: string;
    /** Best executable hedge at current top-of-book, or null if a leg has no ask. */
    arbitrage: ArbitrageQuote | null;
}
