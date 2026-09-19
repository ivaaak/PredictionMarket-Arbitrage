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
// Each poll sweeps the whole open-market catalogue (many paginated requests),
// so these are deliberately slower than a single-endpoint poll would be.
export const KALSHI_POLLING_INTERVAL_MS = parseInt(process.env.KALSHI_POLLING_INTERVAL_MS || '60000', 10);
export const POLYMARKET_POLLING_INTERVAL_MS = parseInt(process.env.POLYMARKET_POLLING_INTERVAL_MS || '60000', 10);
// Upper bound on pages fetched per sweep (Kalshi: 200 events/page, Polymarket: 500 markets/page).
export const KALSHI_MAX_PAGES = parseInt(process.env.KALSHI_MAX_PAGES || '50', 10);
export const POLYMARKET_MAX_PAGES = parseInt(process.env.POLYMARKET_MAX_PAGES || '10', 10);

// --- Matching ---
// How many markets per platform (highest volume first) a match run considers
// when the request does not set `limit`.
export const DEFAULT_MATCH_LIMIT = parseInt(process.env.DEFAULT_MATCH_LIMIT || '300', 10);

// --- Fees (used to turn a gross price gap into a net arbitrage edge) ---
// Kalshi taker fee per contract is roughly rate * P * (1 - P).
export const KALSHI_TAKER_FEE_RATE = parseFloat(process.env.KALSHI_TAKER_FEE_RATE || '0.07');
// Same formula; most Polymarket markets charge no taker fee, some charge one.
export const POLYMARKET_TAKER_FEE_RATE = parseFloat(process.env.POLYMARKET_TAKER_FEE_RATE || '0');

// --- LLM models ---
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// --- LLM API Keys ---
// ANTHROPIC_API_KEY alone runs the engine in single-agent mode.
// Adding GEMINI_API_KEY and OPENAI_API_KEY enables multi-agent consensus.
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// --- Alerting (optional) ---
export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

// --- External API URLs ---
// Gamma is Polymarket's market-catalogue API: one row per market with the
// current best bid/ask, which is what arbitrage pricing needs.
export const POLYMARKET_GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
export const KALSHI_WEBSOCKET_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
