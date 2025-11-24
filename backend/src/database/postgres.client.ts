// src/database/postgres.client.ts
import { Pool, PoolClient } from 'pg';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

dotenv.config();

// Ensure you have DATABASE_URL in your .env file
// Example: postgres://user:password@localhost:5432/market_db
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

// New table for persistent matches
const CREATE_MATCHED_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS matched_events (
    id SERIAL PRIMARY KEY,
    polymarket_ticker TEXT REFERENCES polymarket_data(ticker),
    kalshi_ticker TEXT REFERENCES kalshi_data(ticker),
    similarity_score DECIMAL,
    confidence DECIMAL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(polymarket_ticker, kalshi_ticker)
);
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