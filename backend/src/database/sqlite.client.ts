import Database, { Statement } from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'database.db');
const db = new Database(DB_PATH); //, { verbose: console.log }); // DEBUG Console Log Level for SQL Scripts

const CREATE_POLYMARKET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS polymarket_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    outcome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const CREATE_KALSHI_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS kalshi_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    subtitle TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const UPSERT_POLYMARKET_SQL = `
INSERT INTO polymarket_data (ticker, source, price, volume, timestamp, title, outcome)
VALUES (@ticker, @source, @price, @volume, @timestamp, @title, @outcome)
ON CONFLICT(ticker) DO UPDATE SET
    price = excluded.price,
    volume = excluded.volume,
    timestamp = excluded.timestamp,
    title = COALESCE(excluded.title, polymarket_data.title),
    outcome = COALESCE(excluded.outcome, polymarket_data.outcome),
    updated_at = CURRENT_TIMESTAMP
`;

const UPSERT_KALSHI_SQL = `
INSERT INTO kalshi_data (ticker, source, price, volume, timestamp, title, subtitle)
VALUES (@ticker, @source, @price, @volume, @timestamp, @title, @subtitle)
ON CONFLICT(ticker) DO UPDATE SET
    price = excluded.price,
    volume = excluded.volume,
    timestamp = excluded.timestamp,
    title = COALESCE(excluded.title, kalshi_data.title),
    subtitle = COALESCE(excluded.subtitle, kalshi_data.subtitle),
    updated_at = CURRENT_TIMESTAMP
`;

let upsertPolymarketStatement: Statement;
let upsertKalshiStatement: Statement;

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

export const SQLiteClient = {
    async initialize() {
        console.log(`Initializing SQLite database at: ${DB_PATH}`);
        db.exec(CREATE_POLYMARKET_TABLE_SQL);
        db.exec(CREATE_KALSHI_TABLE_SQL);
        upsertPolymarketStatement = db.prepare(UPSERT_POLYMARKET_SQL);
        upsertKalshiStatement = db.prepare(UPSERT_KALSHI_SQL);
        console.log('[SQLite] Database initialized and statements prepared.');
    },

    savePolymarketData(data: MarketData): number {
        const info = upsertPolymarketStatement.run({
            ticker: data.ticker,
            source: data.source,
            price: data.price,
            volume: data.volume,
            timestamp: data.timestamp,
            title: data.title || null,
            outcome: data.outcome || null
        });
        return info.lastInsertRowid as number;
    },

    saveKalshiData(data: MarketData): number {
        const info = upsertKalshiStatement.run({
            ticker: data.ticker,
            source: data.source,
            price: data.price,
            volume: data.volume,
            timestamp: data.timestamp,
            title: data.title || null,
            subtitle: data.subtitle || null
        });
        return info.lastInsertRowid as number;
    }
};