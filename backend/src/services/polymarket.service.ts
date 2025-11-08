import Database from 'better-sqlite3';
import * as path from 'path';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';

const DB_PATH = path.join(__dirname, '..', '..', 'database.db');
const db = new Database(DB_PATH);

export class PolymarketService {
    /**
     * Get all Polymarket data
     */
    static getAll(limit: number = 100, offset: number = 0): PolymarketDataRecord[] {
        const stmt = db.prepare(`
            SELECT * FROM polymarket_data 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `);
        return stmt.all(limit, offset) as PolymarketDataRecord[];
    }

    /**
     * Get Polymarket data by ID
     */
    static getById(id: number): PolymarketDataRecord | undefined {
        const stmt = db.prepare(`
            SELECT * FROM polymarket_data WHERE id = ?
        `);
        return stmt.get(id) as PolymarketDataRecord | undefined;
    }

    /**
     * Get Polymarket data by ticker
     */
    static getByTicker(ticker: string, limit: number = 100): PolymarketDataRecord[] {
        const stmt = db.prepare(`
            SELECT * FROM polymarket_data 
            WHERE ticker = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `);
        return stmt.all(ticker, limit) as PolymarketDataRecord[];
    }

    /**
     * Get latest Polymarket data for each unique ticker
     */
    static getLatestByTicker(): PolymarketDataRecord[] {
        const stmt = db.prepare(`
            SELECT p1.* FROM polymarket_data p1
            INNER JOIN (
                SELECT ticker, MAX(created_at) as max_created
                FROM polymarket_data
                GROUP BY ticker
            ) p2 ON p1.ticker = p2.ticker AND p1.created_at = p2.max_created
        `);
        return stmt.all() as PolymarketDataRecord[];
    }

    /**
     * Get Polymarket data within a time range
     */
    static getByTimeRange(startTimestamp: number, endTimestamp: number): PolymarketDataRecord[] {
        const stmt = db.prepare(`
            SELECT * FROM polymarket_data 
            WHERE timestamp BETWEEN ? AND ? 
            ORDER BY created_at DESC
        `);
        return stmt.all(startTimestamp, endTimestamp) as PolymarketDataRecord[];
    }

    /**
     * Get count of all Polymarket records
     */
    static getCount(): number {
        const stmt = db.prepare(`SELECT COUNT(*) as count FROM polymarket_data`);
        const result = stmt.get() as { count: number };
        return result.count;
    }
}