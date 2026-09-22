import { useEffect, useRef, useState } from 'react';
import styles from './MatchingPanel.module.css';
import { MarketSearchHit, Venue } from '../types';

interface MarketPickerProps {
    venue: Venue;
    label: string;
    value: MarketSearchHit | null;
    onChange: (market: MarketSearchHit | null) => void;
}

const DEBOUNCE_MS = 250;

/** Type-ahead over one venue's open markets (ticker, title or event title). */
export function MarketPicker({ venue, label, value, onChange }: MarketPickerProps) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<MarketSearchHit[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value || query.trim().length < 2) {
            setHits([]);
            return;
        }
        const controller = new AbortController();
        const id = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/stats/search?source=${venue}&q=${encodeURIComponent(query.trim())}`,
                    { signal: controller.signal }
                );
                const body = await res.json();
                setHits(body.success ? body.data : []);
            } catch {
                if (!controller.signal.aborted) setHits([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(id);
            controller.abort();
        };
    }, [query, venue, value]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    if (value) {
        return (
            <div className={styles.inputGroup}>
                <label>{label}</label>
                <div className={styles.picked}>
                    <div className={styles.pickedText}>
                        <div className={styles.pickedTitle}>{value.title || value.event_title || value.ticker}</div>
                        <div className={styles.pickedMeta}>
                            {value.ticker} · ${Number(value.price).toFixed(2)}
                        </div>
                    </div>
                    <button type="button" className={styles.clearButton} onClick={() => onChange(null)} aria-label={`Clear ${label}`}>
                        ×
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.inputGroup} ref={boxRef}>
            <label>{label}</label>
            <div className={styles.pickerBox}>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Search ticker or title…"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                />
                {open && query.trim().length >= 2 && (
                    <ul className={styles.pickerList}>
                        {loading && hits.length === 0 && <li className={styles.pickerEmpty}>Searching…</li>}
                        {!loading && hits.length === 0 && <li className={styles.pickerEmpty}>No open markets match</li>}
                        {hits.map(hit => (
                            <li key={hit.ticker}>
                                <button
                                    type="button"
                                    className={styles.pickerItem}
                                    onClick={() => { onChange(hit); setQuery(''); setOpen(false); }}
                                >
                                    <span className={styles.pickerTitle}>{hit.title || hit.event_title || hit.ticker}</span>
                                    <span className={styles.pickerMeta}>
                                        {hit.ticker} · ${Number(hit.price).toFixed(2)} · vol {Math.round(hit.volume).toLocaleString()}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
