import { useCallback, useEffect, useState } from 'react';
import styles from './IngestionControl.module.css';
import { IngestionStatus, Venue } from '../types';

const VENUES: { id: Venue; label: string }[] = [
    { id: 'polymarket', label: 'Polymarket' },
    { id: 'kalshi', label: 'Kalshi' },
];

const POLL_MS = 5000;

function ago(iso: string | null): string {
    if (!iso) return 'never';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
}

export function IngestionControl() {
    const [status, setStatus] = useState<IngestionStatus | null>(null);
    const [pending, setPending] = useState<Venue | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/ingestion');
            const body = await res.json();
            if (body.success) {
                setStatus(body.data);
                setError(null);
            } else {
                setError(body.error);
            }
        } catch {
            setError('Backend unreachable');
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    const toggle = async (venue: Venue, enabled: boolean) => {
        setPending(venue);
        try {
            const res = await fetch(`/api/ingestion/${venue}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });
            const body = await res.json();
            if (body.success) setStatus(body.data);
            else setError(body.error);
        } catch (err) {
            setError(String(err));
        } finally {
            setPending(null);
        }
    };

    return (
        <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Data Ingestion</h3>
            {VENUES.map(({ id, label }) => {
                const s = status?.[id];
                const running = !!s?.running;
                return (
                    <div key={id} className={styles.row}>
                        <div className={styles.info}>
                            <div className={styles.name}>
                                <span className={`${styles.dot} ${running ? styles.dotOn : ''}`} />
                                {label}
                                <span className={running ? styles.stateOn : styles.stateOff}>
                                    {running ? 'Live' : 'Off'}
                                </span>
                            </div>
                            <div className={styles.meta}>
                                {s
                                    ? `Sweep ${ago(s.lastSweepAt)} · ${s.lastSweepCount?.toLocaleString() ?? '—'} kept · every ${Math.round(s.intervalMs / 1000)}s`
                                    : 'Status unknown'}
                            </div>
                            {s?.lastRejected != null && (
                                <div
                                    className={styles.meta}
                                    title={Object.entries(s.lastRejectedByReason ?? {}).map(([r, n]) => `${r.replace('_', ' ')}: ${n.toLocaleString()}`).join('\n')}
                                >
                                    {s.lastRejected.toLocaleString()} untradable filtered
                                    {s.lastPruned ? ` · ${s.lastPruned.toLocaleString()} stale pruned` : ''}
                                </div>
                            )}
                            {s?.lastError && (
                                <div className={styles.rowError} title={s.lastError}>
                                    ⚠ Failed {ago(s.lastErrorAt)}: {s.lastError}
                                </div>
                            )}
                        </div>
                        <label className={styles.toggleWrapper} title={running ? `Stop ${label} ingestion` : `Start ${label} ingestion`}>
                            <input
                                type="checkbox"
                                className={styles.toggleInput}
                                checked={running}
                                disabled={!status || pending === id}
                                onChange={(e) => toggle(id, e.target.checked)}
                                aria-label={`${label} ingestion`}
                            />
                            <span className={styles.toggleSlider} />
                        </label>
                    </div>
                );
            })}
            {error && <div className={styles.error}>{error}</div>}
        </div>
    );
}
