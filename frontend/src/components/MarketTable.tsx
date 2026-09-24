import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './DataTable.module.css';
import { KalshiDataRecord, PolymarketDataRecord } from '../types';

type MarketRecord = PolymarketDataRecord & KalshiDataRecord;

const PAGE_SIZE = 100;
// Ingestion sweeps run about once a minute, so polling faster shows nothing new.
const REFRESH_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 300;

const PRICE_BANDS: Record<string, { minPrice?: number; maxPrice?: number; label: string }> = {
    any: { label: 'Any price' },
    longshot: { maxPrice: 0.1, label: '< 10¢' },
    contested: { minPrice: 0.1, maxPrice: 0.9, label: '10¢ – 90¢' },
    favourite: { minPrice: 0.9, label: '> 90¢' }
};

const MIN_VOLUMES = ['', '1000', '10000', '100000', '1000000'];
const CLOSING_DAYS = ['', '1', '7', '30', '90'];

const SORTS = [
    { value: 'volume', label: 'Volume' },
    { value: 'price', label: 'Price' },
    { value: 'spread', label: 'Spread' },
    { value: 'close_time', label: 'Close time' },
    { value: 'updated', label: 'Last update' }
];

interface Filters {
    priceBand: string;
    minVolume: string;
    closingWithinDays: string;
    tradable: boolean;
    sort: string;
    order: 'asc' | 'desc';
}

const DEFAULT_FILTERS: Filters = {
    priceBand: 'any',
    minVolume: '',
    closingWithinDays: '',
    tradable: false,
    sort: 'volume',
    order: 'desc'
};

const cents = (value?: number | null) => (value === null || value === undefined ? '—' : `${(Number(value) * 100).toFixed(1)}¢`);

function formatCloseTime(value?: string | null): string {
    if (!value) return '—';
    const ms = new Date(value).getTime() - Date.now();
    if (ms < 0) return 'closed';
    const hours = ms / 3_600_000;
    if (hours < 24) return `${Math.max(1, Math.round(hours))}h`;
    const days = hours / 24;
    return days < 60 ? `${Math.round(days)}d` : new Date(value).toLocaleDateString();
}

function formatAgo(ms: number): string {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

interface MarketTableProps {
    /** API base, e.g. /api/polymarket */
    endpoint: string;
    variant: 'polymarket' | 'kalshi';
    /** Search text, shared across the market tabs by the parent. */
    search: string;
    onSearchChange: (search: string) => void;
}

export function MarketTable({ endpoint, variant, search, onSearchChange }: MarketTableProps) {
    const [data, setData] = useState<MarketRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState(search);
    const [page, setPage] = useState(0);
    const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
    const [now, setNow] = useState(Date.now());
    const abortRef = useRef<AbortController | null>(null);

    const updateFilters = (patch: Partial<Filters>) => {
        setFilters(prev => ({ ...prev, ...patch }));
        setPage(0);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchInput.trim() !== search) {
                onSearchChange(searchInput.trim());
                setPage(0);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput, search, onSearchChange]);

    const fetchData = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const band = PRICE_BANDS[filters.priceBand];
        const params = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: String(page * PAGE_SIZE),
            sort: filters.sort,
            order: filters.order
        });
        if (search) params.set('search', search);
        if (band.minPrice !== undefined) params.set('minPrice', String(band.minPrice));
        if (band.maxPrice !== undefined) params.set('maxPrice', String(band.maxPrice));
        if (filters.minVolume) params.set('minVolume', filters.minVolume);
        if (filters.closingWithinDays) params.set('closingWithinDays', filters.closingWithinDays);
        if (filters.tradable) params.set('tradable', 'true');

        try {
            const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            if (!result.success || !Array.isArray(result.data)) {
                throw new Error(result.error || 'Invalid data format received');
            }
            setData(result.data);
            setTotal(Number(result.total ?? result.data.length));
            setError(null);
            setLastFetchedAt(Date.now());
        } catch (err) {
            if (controller.signal.aborted) return;
            // Keep the last good rows on screen; a transient failure shouldn't blank the table.
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [endpoint, filters, search, page]);

    // Refetch whenever the query changes, then keep refreshing while the tab is visible.
    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            if (!document.hidden) fetchData();
        }, REFRESH_MS);
        const onVisible = () => { if (!document.hidden) fetchData(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            abortRef.current?.abort();
        };
    }, [fetchData]);

    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(tick);
    }, []);

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const isFiltered = !!search || JSON.stringify({ ...filters, sort: '', order: '' }) !== JSON.stringify({ ...DEFAULT_FILTERS, sort: '', order: '' });
    const columnCount = variant === 'polymarket' ? 8 : 7;

    return (
        <div className={styles.tableContainer}>
            <div className={styles.toolbar}>
                <input
                    className={`${styles.control} ${styles.searchInput}`}
                    type="search"
                    placeholder="Search title, event or ticker…"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    aria-label="Search markets"
                />
                <select className={styles.control} value={filters.priceBand} onChange={e => updateFilters({ priceBand: e.target.value })} aria-label="Price band">
                    {Object.entries(PRICE_BANDS).map(([key, band]) => <option key={key} value={key}>{band.label}</option>)}
                </select>
                <select className={styles.control} value={filters.minVolume} onChange={e => updateFilters({ minVolume: e.target.value })} aria-label="Minimum volume">
                    {MIN_VOLUMES.map(v => <option key={v} value={v}>{v ? `Vol ≥ ${Number(v).toLocaleString()}` : 'Any volume'}</option>)}
                </select>
                <select className={styles.control} value={filters.closingWithinDays} onChange={e => updateFilters({ closingWithinDays: e.target.value })} aria-label="Closing within">
                    {CLOSING_DAYS.map(d => <option key={d} value={d}>{d ? `Closes ≤ ${d}d` : 'Any close'}</option>)}
                </select>
                <label className={styles.checkbox}>
                    <input type="checkbox" checked={filters.tradable} onChange={e => updateFilters({ tradable: e.target.checked })} />
                    Has asks
                </label>
                <select className={styles.control} value={filters.sort} onChange={e => updateFilters({ sort: e.target.value })} aria-label="Sort by">
                    {SORTS.map(s => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
                </select>
                <button
                    className={styles.control}
                    onClick={() => updateFilters({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
                    title="Toggle sort direction"
                >
                    {filters.order === 'desc' ? '↓ Desc' : '↑ Asc'}
                </button>
                {isFiltered && (
                    <button className={styles.control} onClick={() => { setSearchInput(''); onSearchChange(''); setFilters(DEFAULT_FILTERS); setPage(0); }}>
                        Clear
                    </button>
                )}
                <div className={styles.toolbarSpacer} />
                <span className={styles.refreshMeta}>
                    {lastFetchedAt ? `Updated ${formatAgo(now - lastFetchedAt)}` : ''}
                </span>
                <button className={styles.control} onClick={fetchData} title="Refresh now">↻ Refresh</button>
            </div>

            {error && <div className={styles.errorBanner}>Error: {error}</div>}

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Market Name</th>
                            {variant === 'polymarket' && <th>Outcome</th>}
                            <th>Price</th>
                            <th>Bid / Ask</th>
                            <th>Volume</th>
                            <th>Closes</th>
                            <th>Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && data.length === 0 ? (
                            <tr><td colSpan={columnCount} className={styles.noData}>Loading...</td></tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columnCount} className={styles.noData}>
                                    {isFiltered ? 'No markets match these filters' : 'No markets ingested yet — refreshing automatically'}
                                </td>
                            </tr>
                        ) : (
                            data.map(record => (
                                <tr key={record.id}>
                                    <td className={styles.idCell}>
                                        <span className={styles.badge}>{record.id}</span>
                                    </td>
                                    <td className={styles.marketName}>
                                        {record.event_title && record.event_title !== record.title && (
                                            <div className={styles.subtitle}>{record.event_title}</div>
                                        )}
                                        <div className={styles.name}>{record.title || record.ticker}</div>
                                        {record.subtitle && <div className={styles.subtitle}>{record.subtitle}</div>}
                                        <div className={styles.ticker}>{record.ticker}</div>
                                    </td>
                                    {variant === 'polymarket' && (
                                        <td className={styles.outcomeCell}>
                                            {record.outcome && <span className={styles.outcomeBadge}>{record.outcome}</span>}
                                        </td>
                                    )}
                                    <td className={styles.priceCell}>
                                        <span className={styles.priceValue}>{cents(record.price)}</span>
                                    </td>
                                    <td className={styles.bookCell}>
                                        {cents(record.yes_bid)} / {cents(record.yes_ask)}
                                    </td>
                                    <td className={styles.volumeCell}>
                                        {Math.round(Number(record.volume)).toLocaleString()}
                                    </td>
                                    <td className={styles.timestamp}>{formatCloseTime(record.close_time)}</td>
                                    <td className={styles.timestamp}>
                                        {new Date(Number(record.timestamp) * 1000).toLocaleTimeString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className={styles.tableFooter}>
                <span>
                    {total.toLocaleString()} {isFiltered ? 'matching' : ''} markets
                    {total > 0 && ` · showing ${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()}`}
                </span>
                <div className={styles.pager}>
                    <button className={styles.control} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                    <span>{page + 1} / {pageCount}</span>
                    <button className={styles.control} disabled={page + 1 >= pageCount} onClick={() => setPage(p => p + 1)}>Next ›</button>
                </div>
            </div>
        </div>
    );
}
