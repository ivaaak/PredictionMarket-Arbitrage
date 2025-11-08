import { useState } from 'react';
import styles from './MatchingPanel.module.css';
import { MatchFilters, MarketMatch } from '../types';

interface MatchingPanelProps {
    onMatchStart: () => void;
    onMatchComplete: (matches: MarketMatch[]) => void;
    isMatching: boolean;
}

export function MatchingPanel({ onMatchStart, onMatchComplete, isMatching }: MatchingPanelProps) {
    const [filters, setFilters] = useState<MatchFilters>({
        limit: 20
    });
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        onMatchStart();

        try {
            const response = await fetch('/api/matching/match', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(filters)
            });

            const result = await response.json();

            if (result.success) {
                onMatchComplete(result.matches);
            } else {
                setError(result.error);
                onMatchComplete([]);
            }
        } catch (err) {
            setError(String(err));
            onMatchComplete([]);
        }
    };

    return (
        <div className={styles.panel}>
            <h2 className={styles.title}>Matching Engine</h2>
            
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label htmlFor="polymarketTicker">Polymarket Ticker (optional)</label>
                        <input
                            type="text"
                            id="polymarketTicker"
                            value={filters.polymarketTicker || ''}
                            onChange={(e) => setFilters({ ...filters, polymarketTicker: e.target.value || undefined })}
                            placeholder="e.g., market-id-123"
                            disabled={isMatching}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="kalshiTicker">Kalshi Ticker (optional)</label>
                        <input
                            type="text"
                            id="kalshiTicker"
                            value={filters.kalshiTicker || ''}
                            onChange={(e) => setFilters({ ...filters, kalshiTicker: e.target.value || undefined })}
                            placeholder="e.g., TICKER-NAME"
                            disabled={isMatching}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="startTimestamp">Start Timestamp (optional)</label>
                        <input
                            type="number"
                            id="startTimestamp"
                            value={filters.startTimestamp || ''}
                            onChange={(e) => setFilters({ ...filters, startTimestamp: e.target.value ? parseInt(e.target.value) : undefined })}
                            placeholder="Unix timestamp"
                            disabled={isMatching}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="endTimestamp">End Timestamp (optional)</label>
                        <input
                            type="number"
                            id="endTimestamp"
                            value={filters.endTimestamp || ''}
                            onChange={(e) => setFilters({ ...filters, endTimestamp: e.target.value ? parseInt(e.target.value) : undefined })}
                            placeholder="Unix timestamp"
                            disabled={isMatching}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="limit">Limit</label>
                        <input
                            type="number"
                            id="limit"
                            value={filters.limit || 20}
                            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) || 20 })}
                            min="1"
                            max="100"
                            disabled={isMatching}
                        />
                    </div>
                </div>

                {error && (
                    <div className={styles.error}>
                        Error: {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    className={styles.submitButton}
                    disabled={isMatching}
                >
                    {isMatching ? 'Matching...' : 'Start Matching'}
                </button>
                
            </form>
        </div>
    );
}