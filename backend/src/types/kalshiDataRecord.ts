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