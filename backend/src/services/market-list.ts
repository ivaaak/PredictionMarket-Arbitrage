import { Request } from 'express';
import { pool } from '../database/pool';

// Filtered, paginated listing for the market tables. Both market tables share
// one shape, so the query is built once and parameterised by table.

const SORT_COLUMNS = {
    volume: 'volume',
    price: 'price',
    close_time: 'close_time',
    updated: 'updated_at',
    spread: '(yes_ask - yes_bid)'
} as const;

type SortKey = keyof typeof SORT_COLUMNS;
type MarketTable = 'polymarket_data' | 'kalshi_data';

export interface MarketListQuery {
    limit: number;
    offset: number;
    search?: string;
    minVolume?: number;
    minPrice?: number;
    maxPrice?: number;
    /** Only markets with a resting ask on either side. */
    tradable?: boolean;
    /** Only markets closing within this many days (and not already closed). */
    closingWithinDays?: number;
    sort: SortKey;
    ascending: boolean;
}

const optionalNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === '') return undefined;
    const n = parseFloat(String(value));
    return Number.isFinite(n) ? n : undefined;
};

export function parseMarketListQuery(query: Request['query']): MarketListQuery {
    const sort = String(query.sort || 'volume');
    return {
        limit: Math.min(Math.max(parseInt(query.limit as string) || 100, 1), 500),
        offset: Math.max(parseInt(query.offset as string) || 0, 0),
        search: typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined,
        minVolume: optionalNumber(query.minVolume),
        minPrice: optionalNumber(query.minPrice),
        maxPrice: optionalNumber(query.maxPrice),
        tradable: query.tradable === 'true',
        closingWithinDays: optionalNumber(query.closingWithinDays),
        sort: sort in SORT_COLUMNS ? sort as SortKey : 'volume',
        ascending: query.order === 'asc'
    };
}

export async function listMarkets<T>(table: MarketTable, q: MarketListQuery): Promise<{ rows: T[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
    };

    if (q.search) {
        params.push(`%${q.search}%`);
        const p = `$${params.length}`;
        where.push(`(title ILIKE ${p} OR event_title ILIKE ${p} OR ticker ILIKE ${p})`);
    }
    if (q.minVolume !== undefined) add('volume >= ?', q.minVolume);
    if (q.minPrice !== undefined) add('price >= ?', q.minPrice);
    if (q.maxPrice !== undefined) add('price <= ?', q.maxPrice);
    if (q.tradable) where.push('(yes_ask IS NOT NULL OR no_ask IS NOT NULL)');
    if (q.closingWithinDays !== undefined) {
        add(`close_time BETWEEN NOW() AND NOW() + make_interval(days => ?::int)`, Math.ceil(q.closingWithinDays));
    }

    params.push(q.limit, q.offset);
    const sql = `
        SELECT *, COUNT(*) OVER() AS total_count
        FROM ${table}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${SORT_COLUMNS[q.sort]} ${q.ascending ? 'ASC' : 'DESC'} NULLS LAST, id
        LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(sql, params);
    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const rows = result.rows.map(({ total_count, ...row }) => row as T);
    return { rows, total };
}
