import { pool } from '../database/pool';
import { KalshiDataRecord } from '../types/kalshiDataRecord';

export class KalshiService {
    /**
     * Get all Kalshi data
     */
    static async getAll(limit: number = 100, offset: number = 0): Promise<KalshiDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM kalshi_data 
                 ORDER BY updated_at DESC 
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
            return result.rows as KalshiDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get Kalshi data by ID
     */
    static async getById(id: number): Promise<KalshiDataRecord | undefined> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM kalshi_data WHERE id = $1`,
                [id]
            );
            return result.rows[0] as KalshiDataRecord | undefined;
        } finally {
            client.release();
        }
    }

    /**
     * Get Kalshi data by ticker
     */
    static async getByTicker(ticker: string, limit: number = 100): Promise<KalshiDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM kalshi_data 
                 WHERE ticker = $1 
                 ORDER BY updated_at DESC 
                 LIMIT $2`,
                [ticker, limit]
            );
            return result.rows as KalshiDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get the current row for each ticker (`ticker` is unique, so this is one row per market)
     */
    static async getLatestByTicker(): Promise<KalshiDataRecord[]> {
        const result = await pool.query(`SELECT * FROM kalshi_data ORDER BY volume DESC`);
        return result.rows as KalshiDataRecord[];
    }

    /**
     * Open markets to feed the matcher, most traded first. Markets whose close
     * time has passed are excluded because they can no longer be traded.
     */
    static async getMatchCandidates(limit: number, search?: string): Promise<KalshiDataRecord[]> {
        const result = await pool.query(
            `SELECT * FROM kalshi_data
             WHERE (close_time IS NULL OR close_time > NOW())
               -- Rows stored before the ingest quality filter existed may be
               -- untradable; only markets something can be bought on can be an arbitrage leg.
               AND (yes_ask IS NOT NULL OR no_ask IS NOT NULL)
               AND volume > 0
               AND ($2::text IS NULL OR title ILIKE $2 OR event_title ILIKE $2)
             ORDER BY volume DESC
             LIMIT $1`,
            [limit, search ? `%${search}%` : null]
        );
        return result.rows as KalshiDataRecord[];
    }

    /**
     * Get Kalshi data within a time range
     */
    static async getByTimeRange(startTimestamp: number, endTimestamp: number): Promise<KalshiDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM kalshi_data 
                 WHERE timestamp BETWEEN $1 AND $2 
                 ORDER BY updated_at DESC`,
                [startTimestamp, endTimestamp]
            );
            return result.rows as KalshiDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get count of all Kalshi records
     */
    static async getCount(): Promise<number> {
        const client = await pool.connect();
        try {
            const result = await client.query(`SELECT COUNT(*) as count FROM kalshi_data`);
            return Number(result.rows[0].count);
        } finally {
            client.release();
        }
    }
}