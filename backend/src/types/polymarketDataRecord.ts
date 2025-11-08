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