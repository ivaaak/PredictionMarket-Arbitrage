import { pool } from '../database/pool';
import { IngestionSource } from '../types/ingestion';

const TABLES: Record<IngestionSource, string> = {
    polymarket: 'polymarket_data',
    kalshi: 'kalshi_data'
};

const PRICE_BUCKETS = 10;
const HISTORY_HOURS = 24;

export interface VenueStats {
    total: number;
    open: number;
    totalVolume: number;
    lastUpdatedAt: string | null;
    /** Share of open markets in each 10-cent YES price bucket, index 0 = [0, 0.1). */
    priceBuckets: number[];
    topByVolume: { ticker: string; title: string | null; price: number; volume: number }[];
}

export interface MarketSearchHit {
    ticker: string;
    title: string | null;
    event_title: string | null;
    price: number;
    volume: number;
}

async function venueStats(source: IngestionSource): Promise<VenueStats> {
    const table = TABLES[source];
    const open = `(close_time IS NULL OR close_time > NOW())`;

    const [summary, buckets, top] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ${open})::int AS open,
                    COALESCE(SUM(volume) FILTER (WHERE ${open}), 0) AS total_volume,
                    MAX(updated_at) AS last_updated_at
             FROM ${table}`
        ),
        pool.query(
            `SELECT LEAST(FLOOR(price * ${PRICE_BUCKETS}), ${PRICE_BUCKETS - 1})::int AS bucket, COUNT(*)::int AS n
             FROM ${table} WHERE ${open} AND price BETWEEN 0 AND 1
             GROUP BY 1`
        ),
        pool.query(
            `SELECT ticker, COALESCE(title, event_title) AS title, price, volume
             FROM ${table} WHERE ${open}
             ORDER BY volume DESC LIMIT 8`
        )
    ]);

    const counts = new Array(PRICE_BUCKETS).fill(0);
    buckets.rows.forEach((r: { bucket: number; n: number }) => { counts[r.bucket] = r.n; });
    const bucketTotal = counts.reduce((a, b) => a + b, 0) || 1;

    const s = summary.rows[0];
    return {
        total: s.total,
        open: s.open,
        totalVolume: Number(s.total_volume),
        lastUpdatedAt: s.last_updated_at ? new Date(s.last_updated_at).toISOString() : null,
        priceBuckets: counts.map(n => n / bucketTotal),
        topByVolume: top.rows
    };
}

export class StatsService {
    static async overview() {
        const [polymarket, kalshi, history, matches] = await Promise.all([
            venueStats('polymarket'),
            venueStats('kalshi'),
            // Price changes recorded per hour; the ingestor only appends a row
            // when a market's price moved, so this is market activity.
            pool.query(
                // recorded_at is a zone-less TIMESTAMP, so bucket by "hours ago"
                // (computed in the DB's own frame) rather than by absolute hour.
                `SELECT platform,
                        FLOOR(EXTRACT(EPOCH FROM (NOW() - recorded_at)) / 3600)::int AS hours_ago,
                        COUNT(*)::int AS n
                 FROM price_history
                 WHERE recorded_at > NOW() - INTERVAL '${HISTORY_HOURS} hours'
                 GROUP BY 1, 2`
            ),
            pool.query(
                `SELECT id, common_title, price_spread, match_confidence, total_combined_volume
                 FROM matched_events ORDER BY last_sync_at DESC NULLS LAST LIMIT 300`
            )
        ]);

        // Dense rolling-hour axis, oldest first, so quiet hours plot as zero
        // rather than gaps. hours[i] is the end of the bucket (ms epoch).
        const now = Date.now();
        const ago = Array.from({ length: HISTORY_HOURS }, (_, i) => HISTORY_HOURS - 1 - i);
        const hours = ago.map(a => now - a * 3_600_000);
        const lookup = new Map(history.rows.map((r: { platform: string; hours_ago: number; n: number }) => [`${r.platform}:${r.hours_ago}`, r.n]));
        const series = (platform: string) => ago.map(a => lookup.get(`${platform}:${a}`) ?? 0);

        return {
            polymarket,
            kalshi,
            priceUpdates: {
                hours,
                polymarket: series('polymarket'),
                kalshi: series('kalshi')
            },
            storedMatches: matches.rows.map(r => ({
                id: r.id,
                title: r.common_title,
                spread: Number(r.price_spread),
                confidence: Number(r.match_confidence),
                volume: Number(r.total_combined_volume)
            }))
        };
    }

    /**
     * Open markets whose title or event title contains `q`, or whose ticker
     * starts with it, most traded first. Tickers are prefix-only because
     * Polymarket's are hex condition ids that would match almost any substring.
     */
    static async searchMarkets(source: IngestionSource, q: string, limit = 12): Promise<MarketSearchHit[]> {
        const escaped = q.replace(/[\\%_]/g, c => '\\' + c);
        const result = await pool.query(
            `SELECT ticker, title, event_title, price, volume
             FROM ${TABLES[source]}
             WHERE (close_time IS NULL OR close_time > NOW())
               AND (ticker ILIKE $2 OR title ILIKE $1 OR event_title ILIKE $1)
             ORDER BY volume DESC
             LIMIT $3`,
            [`%${escaped}%`, `${escaped}%`, limit]
        );
        return result.rows;
    }
}
