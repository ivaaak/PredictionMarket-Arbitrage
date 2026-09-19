// src/config/index.ts
//
// Single place where the process reads its environment. Importing this module
// loads `.env` (from the backend working directory) before anything else reads
// `process.env`, so import order can never silently produce empty API keys.
import * as dotenv from 'dotenv';

dotenv.config();

// --- Server Config ---
export const PORT = process.env.PORT || '3000';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// --- Database ---
export const DATABASE_URL = process.env.DATABASE_URL || '';

// --- Data ingestion ---
// The ingestor worker thread streams Polymarket/Kalshi data into Postgres.
// Set ENABLE_INGESTOR=false to run the API alone against an already populated DB.
export const ENABLE_INGESTOR = process.env.ENABLE_INGESTOR !== 'false';
export const KALSHI_POLLING_INTERVAL_MS = parseInt(process.env.KALSHI_POLLING_INTERVAL_MS || '5000', 10);

// --- LLM API Keys ---
// ANTHROPIC_API_KEY alone runs the engine in single-agent mode.
// Adding GEMINI_API_KEY and OPENAI_API_KEY enables multi-agent consensus.
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// --- Alerting (optional) ---
export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

// --- External API URLs ---
export const POLYMARKET_API_BASE = "https://data-api.polymarket.com";
export const POLYMARKET_WEBSOCKET_URL = "wss://ws-live-data.polymarket.com";

export const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
export const KALSHI_WEBSOCKET_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
