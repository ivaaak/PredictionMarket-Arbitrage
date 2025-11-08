import styles from './MatchResults.module.css';
import { MarketMatch } from '../types';

interface MatchResultsProps {
    matches: MarketMatch[];
}

export function MatchResults({ matches }: MatchResultsProps) {
    const getSimilarityClass = (similarity: string) => {
        switch (similarity) {
            case 'exact': return styles.exact;
            case 'high': return styles.high;
            case 'medium': return styles.medium;
            case 'low': return styles.low;
            default: return '';
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Match Results ({matches.length})</h2>
            
            {matches.length === 0 ? (
                <div className={styles.noResults}>
                    No matches found. Try adjusting your filters.
                </div>
            ) : (
                <div className={styles.matchList}>
                    {matches.map((match, index) => {
                        const priceDiff = Math.abs(match.polymarketRecord.price - match.kalshiRecord.price);
                        const isArbitrage = priceDiff >= 0.05;

                        return (
                            <div key={index} className={`${styles.matchCard} ${isArbitrage ? styles.arbitrage : ''}`}>
                                <div className={styles.matchHeader}>
                                    <span className={`${styles.similarity} ${getSimilarityClass(match.similarity)}`}>
                                        {match.similarity.toUpperCase()}
                                    </span>
                                    <span className={styles.confidence}>
                                        {(match.confidence * 100).toFixed(0)}% confidence
                                    </span>
                                    {isArbitrage && (
                                        <span className={styles.arbitrageBadge}>
                                            ARBITRAGE OPPORTUNITY
                                        </span>
                                    )}
                                </div>

                                <div className={styles.markets}>
                                    <div className={styles.market}>
                                        <div className={styles.marketHeader}>Polymarket</div>
                                        <div className={styles.marketDetails}>
                                            <div><strong>Ticker:</strong> {match.polymarketRecord.ticker}</div>
                                            <div><strong>Price:</strong> ${match.polymarketRecord.price.toFixed(4)}</div>
                                            <div><strong>Volume:</strong> {match.polymarketRecord.volume.toLocaleString()}</div>
                                        </div>
                                    </div>

                                    <div className={styles.market}>
                                        <div className={styles.marketHeader}>Kalshi</div>
                                        <div className={styles.marketDetails}>
                                            <div><strong>Ticker:</strong> {match.kalshiRecord.ticker}</div>
                                            <div><strong>Price:</strong> ${match.kalshiRecord.price.toFixed(4)}</div>
                                            <div><strong>Volume:</strong> {match.kalshiRecord.volume.toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.reasoning}>
                                    <strong>Reasoning:</strong> {match.reasoning}
                                </div>

                                {isArbitrage && (
                                    <div className={styles.priceDiff}>
                                        Price Difference: ${priceDiff.toFixed(4)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}