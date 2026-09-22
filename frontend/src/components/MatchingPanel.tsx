import { useState } from 'react';
import styles from './MatchingPanel.module.css';
import { MatchFilters, MarketMatch, MarketSearchHit } from '../types';
import { MarketPicker } from './MarketPicker';

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
    const [pairPoly, setPairPoly] = useState<MarketSearchHit | null>(null);
    const [pairKalshi, setPairKalshi] = useState<MarketSearchHit | null>(null);
    const [category, setCategory] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pairNotice, setPairNotice] = useState<string | null>(null);

    const runMatch = async (body: MatchFilters): Promise<MarketMatch[] | null> => {
        setError(null);
        setPairNotice(null);
        onMatchStart();

        try {
            const response = await fetch('/api/matching/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (result.success) {
                onMatchComplete(result.matches);
                return result.matches;
            }
            setError(result.error);
            onMatchComplete([]);
        } catch (err) {
            setError(String(err));
            onMatchComplete([]);
        }
        return null;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        runMatch(filters);
    };

    // Judges exactly this one Polymarket/Kalshi pair (the engine narrows each
    // side to the given ticker), bypassing keyword search and volume ranking.
    const analyzePair = async () => {
        if (!pairPoly || !pairKalshi) return;
        const found = await runMatch({ polymarketTicker: pairPoly.ticker, kalshiTicker: pairKalshi.ticker });
        if (found && found.length === 0) {
            setPairNotice('Judged as different events: no arbitrage between these two markets.');
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
                </div>

                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Manual Pair Analysis</h3>
                    <p className={styles.hint}>
                        Pick one market from each venue to have the engine judge whether they are the same event and price the arbitrage.
                    </p>

                    <MarketPicker venue="polymarket" label="Polymarket market" value={pairPoly} onChange={setPairPoly} />
                    <MarketPicker venue="kalshi" label="Kalshi market" value={pairKalshi} onChange={setPairKalshi} />

                    <button
                        type="button"
                        className={styles.analyzePairButton}
                        disabled={!pairPoly || !pairKalshi || isMatching}
                        onClick={analyzePair}
                    >
                        {isMatching ? 'Analyzing…' : 'Analyze Pair'}
                    </button>
                    {pairNotice && <p className={styles.hint} style={{ marginTop: '0.5rem' }}>{pairNotice}</p>}
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