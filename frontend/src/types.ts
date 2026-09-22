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
export type Venue = 'polymarket' | 'kalshi';

export interface SourceStatus {
    running: boolean;
    intervalMs: number;
    sweeps: number;
    lastSweepAt: string | null;
    lastSweepCount: number | null;
    lastError: string | null;
    lastErrorAt: string | null;
}

export type IngestionStatus = Record<Venue, SourceStatus> & { workerAlive: boolean };

export interface MarketSearchHit {
    ticker: string;
    title: string | null;
    event_title: string | null;
    price: number;
    volume: number;
}

export interface VenueStats {
    total: number;
    open: number;
    totalVolume: number;
    lastUpdatedAt: string | null;
    priceBuckets: number[];
    topByVolume: { ticker: string; title: string | null; price: number; volume: number }[];
}

export interface StatsOverview {
    polymarket: VenueStats;
    kalshi: VenueStats;
    priceUpdates: { hours: number[]; polymarket: number[]; kalshi: number[] };
    storedMatches: { id: number; title: string; spread: number; confidence: number; volume: number }[];
}
