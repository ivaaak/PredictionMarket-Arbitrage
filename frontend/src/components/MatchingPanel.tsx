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
        limit: 50
    });
    const [minProfit, setMinProfit] = useState(1.0);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        onMatchStart();

        try {
            const response = await fetch('/api/matching/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        <div className={styles.panelContainer}>
            <form onSubmit={handleSubmit} className={styles.form}>
                
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Market Matching</h3>
                    
                    <div className={styles.inputGroup}>
                        <label>Keyword Search</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="e.g. 'Election', 'Fed'"
                            onChange={(e) => setFilters({ ...filters, polymarketTicker: e.target.value || undefined })}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                         <label>Polymarket ID (Optional)</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="Market ID..."
                            onChange={(e) => setFilters({ ...filters, polymarketTicker: e.target.value || undefined })}
                        />
                    </div>
                </div>

                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Arbitrage Filters</h3>
                    
                    <div className={styles.inputGroup}>
                        <label>Min. Profit Margin (%)</label>
                        <div className={styles.rangeWrapper}>
                            <input 
                                type="range" 
                                min="0.5" 
                                max="10" 
                                step="0.5"
                                value={minProfit}
                                onChange={(e) => setMinProfit(parseFloat(e.target.value))}
                                className={styles.range}
                            />
                            <span className={styles.rangeValue}>{minProfit}%</span>
                        </div>
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Analysis Limit</label>
                        <input
                            type="number"
                            className={styles.input}
                            value={filters.limit || 50}
                            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) || 20 })}
                        />
                    </div>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button 
                    type="submit" 
                    className={styles.analyzeButton}
                    disabled={isMatching}
                >
                    {isMatching ? 'Analyzing...' : 'Analyze Markets'}
                </button>
            </form>
        </div>
    );
}
