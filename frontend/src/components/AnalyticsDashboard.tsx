import { useCallback, useEffect, useState } from 'react';
import styles from './AnalyticsDashboard.module.css';
import { BarList, GroupedBars, Legend, LineChart, Scatter } from './charts/Charts';
import { fmtCompact } from './charts/format';
import { MarketMatch, StatsOverview } from '../types';

// Venue identity colors (validated for CVD separation on the panel surface).
const POLY = { name: 'Polymarket', color: 'var(--series-poly)' };
const KALSHI = { name: 'Kalshi', color: 'var(--series-kalshi)' };

const REFRESH_MS = 30000;
const PRICE_BUCKET_LABELS = Array.from({ length: 10 }, (_, i) => `${i * 10}¢`);
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const usd = (v: number) => `$${fmtCompact(v)}`;

function Panel({ title, sub, right, children, className }: {
    title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
    return (
        <section className={`${styles.panel} ${className ?? ''}`}>
            <header className={styles.panelHead}>
                <div>
                    <div className={styles.panelTitle}>{title}</div>
                    {sub && <div className={styles.panelSub}>{sub}</div>}
                </div>
                {right}
            </header>
            <div className={styles.panelBody}>{children}</div>
        </section>
    );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
    return (
        <div className={styles.stat}>
            <div className={styles.statLabel}>{label}</div>
            <div className={`${styles.statValue} ${accent ? styles.statAccent : ''}`}>{value}</div>
            {sub && <div className={styles.statSub}>{sub}</div>}
        </div>
    );
}

export function AnalyticsDashboard({ liveMatches }: { liveMatches: MarketMatch[] }) {
    const [data, setData] = useState<StatsOverview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/stats/overview');
            const body = await res.json();
            if (body.success) {
                setData(body.data);
                setError(null);
                setUpdatedAt(new Date());
            } else {
                setError(body.error);
            }
        } catch {
            setError('Backend unreachable');
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    if (!data) {
        return <div className={styles.placeholder}>{error ? `Error: ${error}` : 'Loading analytics…'}</div>;
    }

    const hourLabels = data.priceUpdates.hours.map(h =>
        new Date(h).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const moves24h = [...data.priceUpdates.polymarket, ...data.priceUpdates.kalshi].reduce((a, b) => a + b, 0);
    const edges = liveMatches
        .filter(m => m.arbitrage)
        .sort((a, b) => b.arbitrage!.netEdge - a.arbitrage!.netEdge)
        .slice(0, 8);
    const avgSpread = data.storedMatches.length
        ? data.storedMatches.reduce((a, m) => a + m.spread, 0) / data.storedMatches.length
        : 0;

    return (
        <div className={styles.grid}>
            <div className={styles.stats}>
                <Stat label="Polymarket · open" value={data.polymarket.open.toLocaleString()} sub={`${usd(data.polymarket.totalVolume)} volume`} />
                <Stat label="Kalshi · open" value={data.kalshi.open.toLocaleString()} sub={`${usd(data.kalshi.totalVolume)} volume`} />
                <Stat label="Price moves · 24h" value={fmtCompact(moves24h)} sub="rows appended to history" />
                <Stat label="Stored pairs" value={data.storedMatches.length.toLocaleString()} sub={`avg spread ${(avgSpread * 100).toFixed(1)}¢`} />
                <Stat
                    label="Live net edge · best"
                    value={edges.length ? `${(edges[0].arbitrage!.netEdge * 100).toFixed(1)}¢` : '—'}
                    sub={edges.length ? `${edges.length} priced pairs` : 'run a match to populate'}
                    accent
                />
            </div>

            <Panel
                className={styles.wide}
                title="Market activity · price moves per hour"
                sub={`Last 24h · refreshed ${updatedAt?.toLocaleTimeString() ?? ''}`}
                right={<Legend series={[POLY, KALSHI]} />}
            >
                <LineChart
                    xLabels={hourLabels}
                    series={[
                        { ...POLY, values: data.priceUpdates.polymarket },
                        { ...KALSHI, values: data.priceUpdates.kalshi },
                    ]}
                />
            </Panel>

            <Panel title="Price distribution" sub="Share of open markets by YES price" right={<Legend series={[POLY, KALSHI]} />}>
                <GroupedBars
                    categories={PRICE_BUCKET_LABELS}
                    format={pct}
                    series={[
                        { ...POLY, values: data.polymarket.priceBuckets },
                        { ...KALSHI, values: data.kalshi.priceBuckets },
                    ]}
                />
            </Panel>

            <Panel title="Top Polymarket · by volume" sub="Open markets">
                <BarList
                    color={POLY.color}
                    items={data.polymarket.topByVolume.map(m => ({
                        key: m.ticker,
                        label: m.title || m.ticker,
                        sub: `${m.ticker} · YES ${(m.price * 100).toFixed(0)}¢`,
                        value: m.volume,
                        display: usd(m.volume),
                    }))}
                />
            </Panel>

            <Panel title="Top Kalshi · by volume" sub="Open markets">
                <BarList
                    color={KALSHI.color}
                    items={data.kalshi.topByVolume.map(m => ({
                        key: m.ticker,
                        label: m.title || m.ticker,
                        sub: `${m.ticker} · YES ${(m.price * 100).toFixed(0)}¢`,
                        value: m.volume,
                        display: usd(m.volume),
                    }))}
                />
            </Panel>

            <Panel title="Stored pairs · spread vs confidence" sub="One dot per saved match">
                <Scatter
                    color="var(--accent-primary)"
                    points={data.storedMatches.map(m => ({ key: m.id, x: m.confidence, y: m.spread, label: m.title }))}
                    xLabel="Match confidence"
                    yLabel="Price spread"
                    xFormat={pct}
                    yFormat={(v) => `${(v * 100).toFixed(0)}¢`}
                />
            </Panel>

            <Panel title="Live pairs · net edge after fees" sub="Per $1 contract pair, from the last match run">
                <BarList
                    color="var(--accent-success)"
                    items={edges.map((m, i) => ({
                        key: `${m.polymarketRecord.ticker}:${m.kalshiRecord.ticker}:${i}`,
                        label: m.polymarketRecord.title || m.polymarketRecord.ticker,
                        sub: `ROI ${(m.arbitrage!.roi * 100).toFixed(1)}% · conf ${pct(m.confidence)}`,
                        value: m.arbitrage!.netEdge,
                        display: `${(m.arbitrage!.netEdge * 100).toFixed(1)}¢`,
                    }))}
                />
            </Panel>
        </div>
    );
}
