import { KalshiDataRecord } from "./kalshiDataRecord";
import { PolymarketDataRecord } from "./polymarketDataRecord";

export interface MarketMatch {
    polymarketRecord: PolymarketDataRecord;
    kalshiRecord: KalshiDataRecord;
    similarity: 'exact' | 'high' | 'medium' | 'low';
    confidence: number;
    reasoning: string;
}