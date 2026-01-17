import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { KalshiDataRecord } from '../types/kalshiDataRecord';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export class KalshiService {
    /**
     * Get all Kalshi data
     */
    static async getAll(limit: number = 100, offset: number = 0): Promise<KalshiDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM kalshi_data 
                 ORDER BY created_at DESC 
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
                 ORDER BY created_at DESC 
                 LIMIT $2`,
                [ticker, limit]
            );
            return result.rows as KalshiDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get latest Kalshi data for each unique ticker
     */
    static async getLatestByTicker(): Promise<KalshiDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT k1.* FROM kalshi_data k1
                INNER JOIN (
                    SELECT ticker, MAX(created_at) as max_created
                    FROM kalshi_data
                    GROUP BY ticker
                ) k2 ON k1.ticker = k2.ticker AND k1.created_at = k2.max_created
            `);
            return result.rows as KalshiDataRecord[];
        } finally {
            client.release();
        }
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
                 ORDER BY created_at DESC`,
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
            return parseInt(result.rows[0].count);
        } finally {
            client.release();
        }
    }
}