import { useState } from 'react';
import styles from './App.module.css';
import { PolymarketTable } from './components/PolymarketTable';
import { KalshiTable } from './components/KalshiTable';
import { MatchingPanel } from './components/MatchingPanel';
import { MatchResults } from './components/MatchResults';
import { MarketMatch } from './types';

function App() {
    const [matches, setMatches] = useState<MarketMatch[]>([]);
    const [isMatching, setIsMatching] = useState(false);

    const handleMatchComplete = (newMatches: MarketMatch[]) => {
        setMatches(newMatches);
        setIsMatching(false);
    };

    return (
        <div className={styles.app}>
            {/* <header className={styles.header}>
                <h3>Prediction Market Arbitrage via Matching Engine</h3>
            </header> */}

            <main className={styles.main}>
                <div className={styles.matchingContainer}>
                    <MatchingPanel
                        onMatchStart={() => setIsMatching(true)}
                        onMatchComplete={handleMatchComplete}
                        isMatching={isMatching}
                    />

                    {matches.length > 0 && (
                        <MatchResults matches={matches} />
                    )}
                </div>

                <div className={styles.tablesContainer}>
                    <PolymarketTable />
                    <KalshiTable />
                </div>


            </main>
        </div>
    );
}

export default App;