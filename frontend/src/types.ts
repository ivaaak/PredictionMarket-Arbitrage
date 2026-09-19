/** Prices are dollars (0-1) per $1 contract, for the YES side; null = empty book side. */
interface MarketRecordBase {
    id: number;
    ticker: string;
    source: string;
    price: number;
    volume: number;
    timestamp: number;
    created_at: string;
    title?: string;
    event_title?: string | null;
    yes_bid?: number | null;
    yes_ask?: number | null;
    no_bid?: number | null;
    no_ask?: number | null;
    close_time?: string | null;
}

export interface PolymarketDataRecord extends MarketRecordBase {
    outcome?: string;
}

export interface KalshiDataRecord extends MarketRecordBase {
    subtitle?: string;
}

export interface ArbitrageLeg {
    platform: 'polymarket' | 'kalshi';
    side: 'YES' | 'NO';
    price: number;
    fee: number;
}

/** Buying both legs pays $1 whatever happens; netEdge is profit per pair after fees. */
export interface ArbitrageQuote {
    legs: [ArbitrageLeg, ArbitrageLeg];
    cost: number;
    fees: number;
    grossEdge: number;
    netEdge: number;
    roi: number;
}

export interface MarketMatch {
    polymarketRecord: PolymarketDataRecord;
    kalshiRecord: KalshiDataRecord;
    similarity: 'exact' | 'high' | 'medium' | 'low';
    direction: 'same' | 'inverted';
    confidence: number;
    reasoning: string;
    arbitrage: ArbitrageQuote | null;
}

export interface MatchFilters {
    startTimestamp?: number;
    endTimestamp?: number;
    polymarketTicker?: string;
    kalshiTicker?: string;
    search?: string;
    limit?: number;
}