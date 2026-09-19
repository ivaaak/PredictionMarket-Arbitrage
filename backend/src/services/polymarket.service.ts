import { pool } from '../database/pool';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';

export class PolymarketService {
    /**
     * Get all Polymarket data
     */
    static async getAll(limit: number = 100, offset: number = 0): Promise<PolymarketDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM polymarket_data 
                 ORDER BY updated_at DESC 
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
            return result.rows as PolymarketDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get Polymarket data by ID
     */
    static async getById(id: number): Promise<PolymarketDataRecord | undefined> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM polymarket_data WHERE id = $1`,
                [id]
            );
            return result.rows[0] as PolymarketDataRecord | undefined;
        } finally {
            client.release();
        }
    }

    /**
     * Get Polymarket data by ticker
     */
    static async getByTicker(ticker: string, limit: number = 100): Promise<PolymarketDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM polymarket_data 
                 WHERE ticker = $1 
                 ORDER BY updated_at DESC 
                 LIMIT $2`,
                [ticker, limit]
            );
            return result.rows as PolymarketDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get the current row for each ticker (`ticker` is unique, so this is one row per market)
     */
    static async getLatestByTicker(): Promise<PolymarketDataRecord[]> {
        const result = await pool.query(`SELECT * FROM polymarket_data ORDER BY volume DESC`);
        return result.rows as PolymarketDataRecord[];
    }

    /**
     * Open markets to feed the matcher, most traded first. Markets whose close
     * time has passed are excluded because they can no longer be traded.
     */
    static async getMatchCandidates(limit: number, search?: string): Promise<PolymarketDataRecord[]> {
        const result = await pool.query(
            `SELECT * FROM polymarket_data
             WHERE (close_time IS NULL OR close_time > NOW())
               AND ($2::text IS NULL OR title ILIKE $2 OR event_title ILIKE $2)
             ORDER BY volume DESC
             LIMIT $1`,
            [limit, search ? `%${search}%` : null]
        );
        return result.rows as PolymarketDataRecord[];
    }

    /**
     * Get Polymarket data within a time range
     */
    static async getByTimeRange(startTimestamp: number, endTimestamp: number): Promise<PolymarketDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM polymarket_data 
                 WHERE timestamp BETWEEN $1 AND $2 
                 ORDER BY updated_at DESC`,
                [startTimestamp, endTimestamp]
            );
            return result.rows as PolymarketDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get count of all Polymarket records
     */
    static async getCount(): Promise<number> {
        const client = await pool.connect();
        try {
            const result = await client.query(`SELECT COUNT(*) as count FROM polymarket_data`);
            return Number(result.rows[0].count);
        } finally {
            client.release();
        }
    }
}