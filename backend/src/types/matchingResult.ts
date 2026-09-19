import { MarketMatch } from "./marketMatch";

export interface MatchingResult {
    matches: MarketMatch[];
    totalPolymarketRecords: number;
    totalKalshiRecords: number;
    matchedCount: number;
    /** Pairs the vector pre-filter proposed this run. */
    candidatePairs: number;
    /** Pairs sent to the LLM(s) this run; the rest reused stored verdicts. */
    newlyJudgedPairs: number;
}
