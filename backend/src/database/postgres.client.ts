// src/database/postgres.client.ts
import chalk from 'chalk';
import { pool } from './pool';

// Both market tables share one shape. Every price is the dollar price (0-1) of
// one contract that pays $1, quoted for the market's YES side:
//   price           - display probability (mid of the YES book, else last trade)
//   yes_bid/yes_ask - best bid/ask to sell/buy YES
//   no_bid/no_ask   - best bid/ask to sell/buy NO
// A NULL bid/ask means there is no resting order on that side. Arbitrage is
// priced from the asks, never from `price`.
const MARKET_COLUMNS_SQL = `
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    price DECIMAL NOT NULL,
    volume DECIMAL NOT NULL,
    timestamp BIGINT NOT NULL,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
`;

// Columns added after the first release. ADD COLUMN IF NOT EXISTS lets an
// existing database pick them up without a manual migration.
const MARKET_EXTRA_COLUMNS = [
    'yes_bid DECIMAL',
    'yes_ask DECIMAL',
    'no_bid DECIMAL',
    'no_ask DECIMAL',
    'close_time TIMESTAMPTZ',
    'rules TEXT',
    'event_title TEXT'
];

const CREATE_POLYMARKET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS polymarket_data (${MARKET_COLUMNS_SQL}, outcome TEXT);
${MARKET_EXTRA_COLUMNS.map(c => `ALTER TABLE polymarket_data ADD COLUMN IF NOT EXISTS ${c};`).join('\n')}
CREATE INDEX IF NOT EXISTS idx_polymarket_volume ON polymarket_data(volume DESC);
`;

const CREATE_KALSHI_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS kalshi_data (${MARKET_COLUMNS_SQL}, subtitle TEXT);
${MARKET_EXTRA_COLUMNS.map(c => `ALTER TABLE kalshi_data ADD COLUMN IF NOT EXISTS ${c};`).join('\n')}
CREATE INDEX IF NOT EXISTS idx_kalshi_volume ON kalshi_data(volume DESC);
`;

const CREATE_MATCHED_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS matched_events (
    id SERIAL PRIMARY KEY,

    -- Foreign Keys for Data Integrity
    polymarket_id INTEGER REFERENCES polymarket_data(id) ON DELETE CASCADE,
    kalshi_id INTEGER REFERENCES kalshi_data(id) ON DELETE CASCADE,

    -- Normalized Metadata (What makes them a match?)
    common_title TEXT NOT NULL, -- A cleaned/unified title for the event
    match_category TEXT,        -- e.g., 'Politics', 'Economics', 'Sports'
    match_confidence DECIMAL(3, 2), -- 0.00 to 1.00 score (useful if using fuzzy matching)

    -- Side-by-Side Comparison (The "Readable" part)
    poly_ticker TEXT,
    poly_price DECIMAL,
    poly_volume DECIMAL,

    kalshi_ticker TEXT,
    kalshi_price DECIMAL,
    kalshi_volume DECIMAL,

    -- Derived Analytics
    price_spread DECIMAL GENERATED ALWAYS AS (ABS(poly_price - kalshi_price)) STORED,
    total_combined_volume DECIMAL GENERATED ALWAYS AS (poly_volume + kalshi_volume) STORED,

    -- Metadata
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_match_spread ON matched_events(price_spread);
CREATE INDEX IF NOT EXISTS idx_common_title ON matched_events(common_title);
`;

// New table for price history (TimeSeries)
const CREATE_PRICE_HISTORY_SQL = `
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL,
    platform TEXT NOT NULL,
    price DECIMAL NOT NULL,
    volume DECIMAL NOT NULL,
    timestamp BIGINT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_price_history_ticker ON price_history(ticker);
CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_history(timestamp);
`;

// Whether a Polymarket/Kalshi pair describes the same proposition is decided
// once by the LLMs and does not change when prices move, so the verdict (both
// positive and negative) is persisted and reused across runs and restarts.
const CREATE_MATCH_VERDICTS_SQL = `
CREATE TABLE IF NOT EXISTS match_verdicts (
    poly_ticker TEXT NOT NULL,
    kalshi_ticker TEXT NOT NULL,
    is_match BOOLEAN NOT NULL,
    similarity TEXT,
    direction TEXT,
    confidence DECIMAL,
    reasoning TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (poly_ticker, kalshi_ticker)
);
`;

export interface MarketData {
    ticker: string;
    source: string;
    price: number;
    volume: number;
    timestamp: number;
    title?: string;
    outcome?: string;
    subtitle?: string;
    yes_bid?: number | null;
    yes_ask?: number | null;
    no_bid?: number | null;
    no_ask?: number | null;
    close_time?: string | null;
    rules?: string | null;
    event_title?: string | null;
}

type MarketTable = 'polymarket_data' | 'kalshi_data';

// Postgres caps a statement at 65535 bind parameters; sending each batch as a
// single JSON parameter sidesteps that and keeps a sweep to a few round trips.
const UPSERT_CHUNK_SIZE = 1000;

async function upsertMarkets(table: MarketTable, platform: string, rows: MarketData[]): Promise<void> {
    if (rows.length === 0) return;

    const labelColumn = table === 'polymarket_data' ? 'outcome' : 'subtitle';

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE).map(r => ({
            ...r,
            label: table === 'polymarket_data' ? r.outcome ?? null : r.subtitle ?? null
        }));

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Only rows whose price actually moved are appended to history, so
            // a full-catalogue sweep does not write thousands of duplicates.
            await client.query(
                `WITH incoming AS (
                    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
                        ticker TEXT, source TEXT, price DECIMAL, volume DECIMAL, timestamp BIGINT,
                        title TEXT, label TEXT, yes_bid DECIMAL, yes_ask DECIMAL, no_bid DECIMAL,
                        no_ask DECIMAL, close_time TIMESTAMPTZ, rules TEXT, event_title TEXT
                    )
                )
                INSERT INTO price_history (ticker, platform, price, volume, timestamp)
                SELECT i.ticker, $2, i.price, i.volume, i.timestamp
                FROM incoming i
                LEFT JOIN ${table} t ON t.ticker = i.ticker
                WHERE t.ticker IS NULL OR t.price IS DISTINCT FROM i.price`,
                [JSON.stringify(chunk), platform]
            );
            await client.query(
                `INSERT INTO ${table} (ticker, source, price, volume, timestamp, title, ${labelColumn},
                                       yes_bid, yes_ask, no_bid, no_ask, close_time, rules, event_title, updated_at)
                 SELECT ticker, source, price, volume, timestamp, title, label,
                        yes_bid, yes_ask, no_bid, no_ask, close_time, rules, event_title, CURRENT_TIMESTAMP
                 FROM jsonb_to_recordset($1::jsonb) AS x(
                     ticker TEXT, source TEXT, price DECIMAL, volume DECIMAL, timestamp BIGINT,
                     title TEXT, label TEXT, yes_bid DECIMAL, yes_ask DECIMAL, no_bid DECIMAL,
                     no_ask DECIMAL, close_time TIMESTAMPTZ, rules TEXT, event_title TEXT
                 )
                 ON CONFLICT (ticker) DO UPDATE SET
                     source = EXCLUDED.source,
                     price = EXCLUDED.price,
                     volume = EXCLUDED.volume,
                     timestamp = EXCLUDED.timestamp,
                     title = COALESCE(EXCLUDED.title, ${table}.title),
                     ${labelColumn} = COALESCE(EXCLUDED.${labelColumn}, ${table}.${labelColumn}),
                     yes_bid = EXCLUDED.yes_bid,
                     yes_ask = EXCLUDED.yes_ask,
                     no_bid = EXCLUDED.no_bid,
                     no_ask = EXCLUDED.no_ask,
                     close_time = COALESCE(EXCLUDED.close_time, ${table}.close_time),
                     rules = COALESCE(EXCLUDED.rules, ${table}.rules),
                     event_title = COALESCE(EXCLUDED.event_title, ${table}.event_title),
                     updated_at = CURRENT_TIMESTAMP`,
                [JSON.stringify(chunk)]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }
}

export const PostgresClient = {
    async initialize() {
        const client = await pool.connect();
        try {
            console.log(chalk.blue.bold('[Postgres]'), chalk.cyan('Initializing database tables...'));

            await client.query('BEGIN');
            await client.query(CREATE_POLYMARKET_TABLE_SQL);
            await client.query(CREATE_KALSHI_TABLE_SQL);
            await client.query(CREATE_MATCHED_EVENTS_SQL);
            await client.query(CREATE_PRICE_HISTORY_SQL);
            await client.query(CREATE_MATCH_VERDICTS_SQL);
            await client.query('COMMIT');

            console.log(chalk.blue.bold('[Postgres]'), chalk.green('Database initialized successfully.'));
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(chalk.blue.bold('[Postgres]'), chalk.red('Initialization failed:'), error);
            throw error;
        } finally {
            client.release();
        }
    },

    async savePolymarketMarkets(rows: MarketData[]): Promise<void> {
        await upsertMarkets('polymarket_data', 'polymarket', rows);
    },

    async saveKalshiMarkets(rows: MarketData[]): Promise<void> {
        await upsertMarkets('kalshi_data', 'kalshi', rows);
    }
};
