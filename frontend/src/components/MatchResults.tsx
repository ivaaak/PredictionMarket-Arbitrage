import { useState, useEffect } from 'react';
import styles from './MatchResults.module.css';
import { MarketMatch } from '../types';

interface MatchedEvent {
    id: number;
    polymarket_id: number;
    kalshi_id: number;
    common_title: string;
    match_category: string;
    match_confidence: number;
    poly_ticker: string;
    poly_price: number;
    poly_volume: number;
    kalshi_ticker: string;
    kalshi_price: number;
    kalshi_volume: number;
    price_spread: number;        // Generated Always
    total_combined_volume: number; // Generated Always
    is_active: boolean;
}

interface MatchResultsProps {
    matches: MarketMatch[];
}

export function MatchResults({ matches }: MatchResultsProps) {
    const [dbMatches, setDbMatches] = useState<MatchedEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDbMatches, setShowDbMatches] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (showDbMatches) {
            fetchDbMatches();
        }
    }, [showDbMatches]);

    const fetchDbMatches = async () => {
        try {
            setLoading(true);
            setSaveError(null);
            const response = await fetch('/api/results/matched-events');
            const result = await response.json();
            if (result.success) {
                setDbMatches(result.data);
            } else {
                setSaveError(result.error || 'Failed to load matched events.');
            }
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    };

    const saveToDatabase = async (match: MarketMatch) => {
        try {
            const payload = {
                polymarket_id: match.polymarketRecord.id,
                kalshi_id: match.kalshiRecord.id,
                // common_title is NOT NULL on the server, and title is optional
                // on the record, so fall back to the ticker.
                common_title: match.polymarketRecord.title || match.polymarketRecord.ticker,
                match_category: 'general',
                match_confidence: match.confidence,
                poly_ticker: match.polymarketRecord.ticker,
                poly_price: match.polymarketRecord.price,
                poly_volume: match.polymarketRecord.volume,
                kalshi_ticker: match.kalshiRecord.ticker,
                kalshi_price: match.kalshiRecord.price,
                kalshi_volume: match.kalshiRecord.volume,
                is_active: true
            };

            const response = await fetch('/api/results/matched-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.success) {
                setSaveError(null);
                if (showDbMatches) fetchDbMatches();
            } else {
                setSaveError(result.error || 'Failed to save match.');
            }
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
        }
    };

    const getConfidenceClass = (score: number) => {
        if (score >= 0.9) return styles.exact;
        if (score >= 0.7) return `${styles.badge} ${styles.high}`;
        if (score >= 0.4) return `${styles.badge} ${styles.medium}`;
        return `${styles.badge} ${styles.low}`;
    };

    if (matches.length === 0 && !showDbMatches) {
        return (
            <div className={styles.emptyState}>
                <h3>No Live Opportunities Found</h3>
                <p>Check filters or view previously saved matches.</p>
                <button className={styles.executeButton} onClick={() => setShowDbMatches(true)}>
                    View Database History
                </button>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>{showDbMatches ? 'Stored Market Pairs' : 'Live Arbitrage Feed'}</h2>
                <div className={styles.headerActions}>
                    <div className={styles.stats}>
                        <span className={styles.statsBadge}>
                            {showDbMatches ? `${dbMatches.length} DB Records` : `${matches.length} Live Pairs`}
                        </span>
                    </div>
                    <button className={styles.executeButton} onClick={() => setShowDbMatches(!showDbMatches)}>
                        {showDbMatches ? 'Switch to Live' : 'View Database'}
                    </button>
                </div>
            </div>

            {loading && <div className={styles.notice}>Loading stored matches...</div>}
            {saveError && <div className={styles.error}>{saveError}</div>}

            <div className={styles.tableWrapper}>
                <table className={styles.arbTable}>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Market Info</th>
                            <th>Pricing Snapshots</th>
                            <th className={styles.numeric}>{showDbMatches ? 'Spread' : 'Net Edge'}</th>
                            <th className={styles.numeric}>Combined Vol</th>
                            <th>Confidence</th>
                            <th>Status / Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {showDbMatches ? (
                            dbMatches.map((m) => (
                                <tr key={m.id}>
                                    <td className={styles.idCell}><span className={styles.matchIdBadge}>#{m.id}</span></td>
                                    <td className={styles.marketPair}>
                                        <div className={styles.marketTitle}>{m.common_title}</div>
                                        <div className={styles.strategyBadge} style={{padding: '2px 6px', fontSize: '0.7rem'}}>
                                            {m.match_category}
                                        </div>
                                    </td>
                                    <td className={styles.volumeCell}>
                                        <div className={styles.volumeItem}>
                                            <span className={styles.platformLabel}>PM</span>
                                            <span className={styles.priceValue}>${Number(m.poly_price).toFixed(2)}</span>
                                        </div>
                                        <div className={styles.volumeItem}>
                                            <span className={styles.platformLabel}>KL</span>
                                            <span className={styles.priceValue}>${Number(m.kalshi_price).toFixed(2)}</span>
                                        </div>
                                    </td>
                                    <td className={`${styles.numeric} ${styles.profitPositive}`}>
                                        ${Number(m.price_spread).toFixed(3)}
                                    </td>
                                    <td className={styles.numeric}>
                                        {Number(m.total_combined_volume).toLocaleString()}
                                    </td>
                                    <td>
                                        <span className={getConfidenceClass(m.match_confidence)}>
                                            {(m.match_confidence * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td className={styles.statusCell}>
                                        <span className={m.is_active ? styles.statusActive : styles.statusInactive}>
                                            {m.is_active && <div className={styles.statusDot} />}
                                            {m.is_active ? 'Active' : 'Archived'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            matches.map((match, idx) => {
                                const arb = match.arbitrage;
                                return (
                                    <tr key={idx} className={styles.opportunityRow}>
                                        <td className={styles.idCell}><span className={styles.matchIdBadge}>LIVE</span></td>
                                        <td className={styles.marketPair}>
                                            <div className={styles.marketTitle}>{match.polymarketRecord.title}</div>
                                            <div className={styles.pairItem}>
                                                <code>{match.polymarketRecord.ticker}</code>
                                                {match.direction === 'inverted' && ' · inverted (PM YES = KL NO)'}
                                            </div>
                                        </td>
                                        <td className={styles.volumeCell}>
                                            <div className={styles.volumeItem}>
                                                <span className={styles.volumeLabel}>PM</span>
                                                <span className={styles.volumeValue}>${match.polymarketRecord.price.toFixed(2)}</span>
                                            </div>
                                            <div className={styles.volumeItem}>
                                                <span className={styles.volumeLabel}>KL</span>
                                                <span className={styles.volumeValue}>${match.kalshiRecord.price.toFixed(2)}</span>
                                            </div>
                                        </td>
                                        <td
                                            className={`${styles.numeric} ${arb && arb.netEdge > 0 ? styles.roiPositive : ''}`}
                                            title={arb ? arb.legs.map(l => `Buy ${l.side} on ${l.platform} @ $${l.price.toFixed(2)}`).join(' + ') + ` · fees $${arb.fees.toFixed(3)}` : 'A leg has no ask; cannot price the hedge'}
                                        >
                                            {arb ? `$${arb.netEdge.toFixed(3)}` : '—'}
                                        </td>
                                        <td className={styles.numeric}>
                                            {(match.polymarketRecord.volume + match.kalshiRecord.volume).toLocaleString()}
                                        </td>
                                        <td>
                                            <span className={getConfidenceClass(match.confidence)}>
                                                {(match.confidence * 100).toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className={styles.statusCell}>
                                            <button className={styles.executeButton} onClick={() => saveToDatabase(match)}>
                                                Save to DB
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}