import Database, { Statement } from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'database.db');
const db = new Database(DB_PATH); //, { verbose: console.log }); // DEBUG Console Log Level for SQL Scripts

const CREATE_POLYMARKET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS polymarket_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    source TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    outcome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const CREATE_KALSHI_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS kalshi_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    source TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    subtitle TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const INSERT_POLYMARKET_SQL = `
INSERT INTO polymarket_data (ticker, source, price, volume, timestamp, title, outcome)
VALUES (@ticker, @source, @price, @volume, @timestamp, @title, @outcome)
`;

const INSERT_KALSHI_SQL = `
INSERT INTO kalshi_data (ticker, source, price, volume, timestamp, title, subtitle)
VALUES (@ticker, @source, @price, @volume, @timestamp, @title, @subtitle)
`;

let insertPolymarketStatement: Statement;
let insertKalshiStatement: Statement;

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
        insertPolymarketStatement = db.prepare(INSERT_POLYMARKET_SQL);
        insertKalshiStatement = db.prepare(INSERT_KALSHI_SQL);
        console.log('[SQLite] Database initialized and statements prepared.');
    },

    savePolymarketData(data: MarketData): number {
        const info = insertPolymarketStatement.run({
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
        const info = insertKalshiStatement.run({
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