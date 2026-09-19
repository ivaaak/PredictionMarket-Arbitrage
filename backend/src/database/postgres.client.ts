// src/database/postgres.client.ts
import { PoolClient } from 'pg';
import chalk from 'chalk';
import { pool } from './pool';

const CREATE_POLYMARKET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS polymarket_data (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    price DECIMAL NOT NULL,
    volume DECIMAL NOT NULL,
    timestamp BIGINT NOT NULL,
    title TEXT,
    outcome TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const CREATE_KALSHI_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS kalshi_data (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    price DECIMAL NOT NULL,
    volume DECIMAL NOT NULL,
    timestamp BIGINT NOT NULL,
    title TEXT,
    subtitle TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
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

export interface MarketData {
    ticker: string;
    source: string;
    price: number;
    volume: number;
    timestamp: number;
    title?: string;
    outcome?: string;
    subtitle?: string;
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

    async savePolymarketData(data: MarketData): Promise<void> {
        const client = await pool.connect();
        try {
            // Upsert Logic for Polymarket
            const query = `
                INSERT INTO polymarket_data (ticker, source, price, volume, timestamp, title, outcome, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT(ticker) DO UPDATE SET
                    price = EXCLUDED.price,
                    volume = EXCLUDED.volume,
                    timestamp = EXCLUDED.timestamp,
                    updated_at = CURRENT_TIMESTAMP,
                    title = COALESCE(EXCLUDED.title, polymarket_data.title),
                    outcome = COALESCE(EXCLUDED.outcome, polymarket_data.outcome);
            `;
            
            await client.query(query, [
                data.ticker, data.source, data.price, data.volume, 
                data.timestamp, data.title || null, data.outcome || null
            ]);

            // Optional: Record history
            await this.saveHistory(client, data.ticker, 'polymarket', data.price, data.volume, data.timestamp);
            
        } catch (error) {
            console.error(chalk.red(`[Postgres] Save Polymarket failed for ${data.ticker}:`), error);
        } finally {
            client.release();
        }
    },

    async saveKalshiData(data: MarketData): Promise<void> {
        const client = await pool.connect();
        try {
            // Upsert Logic for Kalshi
            const query = `
                INSERT INTO kalshi_data (ticker, source, price, volume, timestamp, title, subtitle, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT(ticker) DO UPDATE SET
                    price = EXCLUDED.price,
                    volume = EXCLUDED.volume,
                    timestamp = EXCLUDED.timestamp,
                    updated_at = CURRENT_TIMESTAMP,
                    title = COALESCE(EXCLUDED.title, kalshi_data.title),
                    subtitle = COALESCE(EXCLUDED.subtitle, kalshi_data.subtitle);
            `;

            await client.query(query, [
                data.ticker, data.source, data.price, data.volume, 
                data.timestamp, data.title || null, data.subtitle || null
            ]);

            // Optional: Record history
            await this.saveHistory(client, data.ticker, 'kalshi', data.price, data.volume, data.timestamp);

        } catch (error) {
            console.error(chalk.red(`[Postgres] Save Kalshi failed for ${data.ticker}:`), error);
        } finally {
            client.release();
        }
    },

    // Helper to save historical data points
    async saveHistory(client: PoolClient, ticker: string, platform: string, price: number, volume: number, timestamp: number) {
        const historyQuery = `
            INSERT INTO price_history (ticker, platform, price, volume, timestamp)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(historyQuery, [ticker, platform, price, volume, timestamp]);
    }
};