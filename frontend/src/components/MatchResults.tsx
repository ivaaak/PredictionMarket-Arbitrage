import styles from './MatchResults.module.css';
import { MarketMatch } from '../types';

interface MatchResultsProps {
    matches: MarketMatch[];
}

export function MatchResults({ matches }: MatchResultsProps) {
    
    // Helper to calculate profit and strategy
    const getArbitrageDetails = (match: MarketMatch) => {
        const pmPrice = match.polymarketRecord.price;
        const kalshiPrice = match.kalshiRecord.price;
        const diff = Math.abs(pmPrice - kalshiPrice);
        const profitPercent = (diff / Math.min(pmPrice, kalshiPrice)) * 100;
        
        let strategy = "-";
        if (pmPrice > kalshiPrice) {
            strategy = "Buy Kalshi (YES) / Sell PM (YES)";
        } else {
            strategy = "Buy PM (YES) / Sell Kalshi (YES)";
        }

        return { diff, profitPercent, strategy };
    };

    if (matches.length === 0) {
        return (
            <div className={styles.emptyState}>
                <h3>No Opportunities Found</h3>
                <p>Use the matching panel in the sidebar to search for arbitrage.</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>High-Potential Matches</h2>
                <div className={styles.stats}>
                    Found {matches.length} pairs
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.arbTable}>
                    <thead>
                        <tr>
                            <th>Confidence</th>
                            <th>Market Pair</th>
                            <th>Strategy</th>
                            <th className={styles.numeric}>PM Price</th>
                            <th className={styles.numeric}>Kalshi Price</th>
                            <th className={styles.numeric}>Profit Spread</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map((match, index) => {
                            const { diff, profitPercent, strategy } = getArbitrageDetails(match);
                            const isProfitable = diff >= 0.05; // Arbitrary threshold for visual styling

                            return (
                                <tr key={index} className={isProfitable ? styles.opportunityRow : ''}>
                                    <td>
                                        <span className={`${styles.badge} ${styles[match.similarity]}`}>
                                            {match.similarity}
                                        </span>
                                        <div className={styles.confidenceScore}>
                                            {(match.confidence * 100).toFixed(0)}% match
                                        </div>
                                    </td>
                                    <td className={styles.marketPair}>
                                        <div className={styles.pairItem}>
                                            <span className={styles.platformLabel}>PM</span>
                                            {match.polymarketRecord.ticker}
                                        </div>
                                        <div className={styles.pairItem}>
                                            <span className={styles.platformLabel}>KS</span>
                                            {match.kalshiRecord.ticker}
                                        </div>
                                    </td>
                                    <td className={styles.strategyCell}>
                                        {strategy}
                                    </td>
                                    <td className={styles.numeric}>${match.polymarketRecord.price.toFixed(3)}</td>
                                    <td className={styles.numeric}>${match.kalshiRecord.price.toFixed(3)}</td>
                                    <td className={styles.numeric}>
                                        <span className={isProfitable ? styles.profitPositive : styles.profitNeutral}>
                                            {profitPercent.toFixed(2)}%
                                        </span>
                                        <div className={styles.diffVal}>${diff.toFixed(3)}</div>
                                    </td>
                                    <td>
                                        <button className={styles.executeButton}>
                                            Execute
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}