/**
 * Columns shared by `polymarket_data` and `kalshi_data`. All prices are dollars
 * (0-1) per $1 contract, quoted for the market's YES side. A null bid/ask means
 * that side of the book is empty.
 */
export interface MarketRecordBase {
    id: number;
    ticker: string;
    source: string;
    /** Display probability of YES (book mid, or last trade). Not tradable. */
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
    rules?: string | null;
}
