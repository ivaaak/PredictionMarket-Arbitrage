import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export class PolymarketService {
    /**
     * Get all Polymarket data
     */
    static async getAll(limit: number = 100, offset: number = 0): Promise<PolymarketDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM polymarket_data 
                 ORDER BY created_at DESC 
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
                 ORDER BY created_at DESC 
                 LIMIT $2`,
                [ticker, limit]
            );
            return result.rows as PolymarketDataRecord[];
        } finally {
            client.release();
        }
    }

    /**
     * Get latest Polymarket data for each unique ticker
     */
    static async getLatestByTicker(): Promise<PolymarketDataRecord[]> {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT p1.* FROM polymarket_data p1
                INNER JOIN (
                    SELECT ticker, MAX(created_at) as max_created
                    FROM polymarket_data
                    GROUP BY ticker
                ) p2 ON p1.ticker = p2.ticker AND p1.created_at = p2.max_created
            `);
            return result.rows as PolymarketDataRecord[];
        } finally {
            client.release();
        }
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
                 ORDER BY created_at DESC`,
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
            return parseInt(result.rows[0].count);
        } finally {
            client.release();
        }
    }
}