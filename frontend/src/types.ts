export interface PolymarketDataRecord {
    id: number;
    ticker: string;
    source: string;
    price: number;
    volume: number;
    timestamp: number;
    created_at: string;
    title?: string;
    outcome?: string;
}

export interface KalshiDataRecord {
    id: number;
    ticker: string;
    source: string;
    price: number;
    volume: number;
    timestamp: number;
    created_at: string;
    title?: string;
    subtitle?: string;
}

export interface MarketMatch {
    polymarketRecord: PolymarketDataRecord;
    kalshiRecord: KalshiDataRecord;
    similarity: 'exact' | 'high' | 'medium' | 'low';
    confidence: number;
    reasoning: string;
}

export interface MatchFilters {
    startTimestamp?: number;
    endTimestamp?: number;
    polymarketTicker?: string;
    kalshiTicker?: string;
    limit?: number;
}