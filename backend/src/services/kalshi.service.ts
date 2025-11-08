import Database from 'better-sqlite3';
import * as path from 'path';
import { KalshiDataRecord } from '../types/kalshiDataRecord';

const DB_PATH = path.join(__dirname, '..', '..', 'database.db');
const db = new Database(DB_PATH);

export class KalshiService {
    /**
     * Get all Kalshi data
     */
    static getAll(limit: number = 100, offset: number = 0): KalshiDataRecord[] {
        const stmt = db.prepare(`
            SELECT * FROM kalshi_data 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `);
        return stmt.all(limit, offset) as KalshiDataRecord[];
    }

    /**
     * Get Kalshi data by ID
     */
    static getById(id: number): KalshiDataRecord | undefined {
        const stmt = db.prepare(`
            SELECT * FROM kalshi_data WHERE id = ?
        `);
        return stmt.get(id) as KalshiDataRecord | undefined;
    }

    /**
     * Get Kalshi data by ticker
     */
    static getByTicker(ticker: string, limit: number = 100): KalshiDataRecord[] {
        const stmt = db.prepare(`
            SELECT * FROM kalshi_data 
            WHERE ticker = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `);
        return stmt.all(ticker, limit) as KalshiDataRecord[];
    }

    /**
     * Get latest Kalshi data for each unique ticker
     */
    static getLatestByTicker(): KalshiDataRecord[] {
        const stmt = db.prepare(`
            SELECT k1.* FROM kalshi_data k1
            INNER JOIN (
                SELECT ticker, MAX(created_at) as max_created
                FROM kalshi_data
                GROUP BY ticker
            ) k2 ON k1.ticker = k2.ticker AND k1.created_at = k2.max_created
        `);
        return stmt.all() as KalshiDataRecord[];
    }

    /**
     * Get Kalshi data within a time range
     */
    static getByTimeRange(startTimestamp: number, endTimestamp: number): KalshiDataRecord[] {
        const stmt = db.prepare(`
            SELECT * FROM kalshi_data 
            WHERE timestamp BETWEEN ? AND ? 
            ORDER BY created_at DESC
        `);
        return stmt.all(startTimestamp, endTimestamp) as KalshiDataRecord[];
    }

    /**
     * Get count of all Kalshi records
     */
    static getCount(): number {
        const stmt = db.prepare(`SELECT COUNT(*) as count FROM kalshi_data`);
        const result = stmt.get() as { count: number };
        return result.count;
    }
}