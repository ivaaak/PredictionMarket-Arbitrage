// src/types/market.ts

// Define the standardized format for all market data
export interface NormalizedMarketData {
    ticker: string;
    source: 'polymarket' | 'kalshi';
    price: number;
    volume: number;
}

// Polymarket uses 'price' and 'volume', so it maps directly.
export interface PolymarketMarketData {
    ticker: string;
    price: number;
    volume: number;
    // ... other Polymarket-specific fields ...
}

// Kalshi uses bid/ask, which must be converted to a single 'price'.
export interface KalshiMarketData {
    ticker_name: string; // The original field name
    price: number;       // The normalized price (e.g., mid-price)
    yes_bid: number;
    yes_ask: number;
    volume: number;
}