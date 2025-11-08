// src/config/index.ts

// --- Server Config ---
export const PORT = process.env.PORT || '3000';

export const POLYMARKET_API_BASE = "https://data-api.polymarket.com";
export const POLYMARKET_WEBSOCKET_URL = "wss://ws-live-data.polymarket.com";

export const KALSHI_WEBSOCKET_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
