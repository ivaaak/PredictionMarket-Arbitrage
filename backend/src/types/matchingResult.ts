import { MarketMatch } from "./marketMatch";

export interface MatchingResult {
    matches: MarketMatch[];
    totalPolymarketRecords: number;
    totalKalshiRecords: number;
    matchedCount: number;
}