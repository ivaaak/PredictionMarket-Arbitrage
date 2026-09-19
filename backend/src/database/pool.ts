// src/database/pool.ts
//
// One shared `pg` connection pool for the whole process. Every service imports
// this instead of constructing its own Pool, so a single process holds one set
// of connections instead of one per module.
import { Pool, types as pgTypes } from 'pg';
import { DATABASE_URL, IS_PRODUCTION } from '../config';

// node-postgres returns NUMERIC/DECIMAL and BIGINT as strings to avoid losing
// precision on values outside the IEEE-754 safe range. Every such column here
// (price, volume, price_spread, timestamp) is typed `number` in src/types and
// is arithmetic'd and .toFixed()'d by both the API and the UI, so parse them
// once at the driver instead of sprinkling Number() over every call site.
const OID_NUMERIC = 1700;
const OID_INT8 = 20;

pgTypes.setTypeParser(OID_NUMERIC, (value: string) => parseFloat(value));
pgTypes.setTypeParser(OID_INT8, (value: string) => parseInt(value, 10));

export const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false
});

/**
 * Closes the shared pool. Called during graceful shutdown.
 */
export async function closePool(): Promise<void> {
    await pool.end();
}
