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
    const [minLiquidity, setMinLiquidity] = useState(10000);
    const [maxResolutionDate, setMaxResolutionDate] = useState('2026-12-31');
    const [matchConfidence, setMatchConfidence] = useState('medium-high');
    const [autoMatch, setAutoMatch] = useState(false);
    const [platformA, setPlatformA] = useState('polymarket');
    const [platformB, setPlatformB] = useState('kalshi');
    const [category, setCategory] = useState('');
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
                            placeholder="Search markets (e.g., 'Fed Rate')"
                            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Auto-Match Algorithm</label>
                        <label className={styles.toggleWrapper}>
                            <input
                                type="checkbox"
                                checked={autoMatch}
                                onChange={(e) => setAutoMatch(e.target.checked)}
                                className={styles.toggleInput}
                            />
                            <span className={styles.toggleSlider}></span>
                        </label>
                    </div>

                    {!autoMatch && (
                        <>
                            <div className={styles.inputGroup}>
                                <label>Manual Pair Analysis:</label>
                            </div>
                            
                            <div className={styles.inputGroup}>
                                <select 
                                    className={styles.select}
                                    value={platformA}
                                    onChange={(e) => setPlatformA(e.target.value)}
                                >
                                    <option value="polymarket">Polymarket</option>
                                </select>
                            </div>

                            <div className={styles.inputGroup}>
                                <select 
                                    className={styles.select}
                                    value={platformB}
                                    onChange={(e) => setPlatformB(e.target.value)}
                                >
                                    <option value="kalshi">Kalshi</option>
                                </select>
                            </div>

                            <button 
                                type="button"
                                className={styles.analyzePairButton}
                            >
                                Analyze Pair
                            </button>
                        </>
                    )}
                </div>

                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Arbitrage Filters</h3>
                    
                    <div className={styles.inputGroup}>
                        <label>Min. Profit Margin: {minProfit}%</label>
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
                        </div>
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Min. Combined Liquidity:</label>
                        <input
                            type="text"
                            className={styles.input}
                            value={`$${minLiquidity.toLocaleString()}`}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[$,]/g, '');
                                setMinLiquidity(parseInt(value) || 0);
                            }}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Max. Resolution Date:</label>
                        <input
                            type="date"
                            className={styles.input}
                            value={maxResolutionDate}
                            onChange={(e) => setMaxResolutionDate(e.target.value)}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Match Confidence:</label>
                        <select 
                            className={styles.select}
                            value={matchConfidence}
                            onChange={(e) => setMatchConfidence(e.target.value)}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="medium-high">Medium & High</option>
                        </select>
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Category</label>
                        <select 
                            className={styles.select}
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <option value="">All Categories</option>
                            <option value="politics">Politics</option>
                            <option value="sports">Sports</option>
                            <option value="crypto">Crypto</option>
                            <option value="economics">Economics</option>
                            <option value="entertainment">Entertainment</option>
                        </select>
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