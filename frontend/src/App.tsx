import { useState } from 'react';
import styles from './App.module.css';
import { PolymarketTable } from './components/PolymarketTable';
import { KalshiTable } from './components/KalshiTable';
import { MatchingPanel } from './components/MatchingPanel';
import { MatchResults } from './components/MatchResults';
import { MarketMatch } from './types';

type Tab = 'polymarket' | 'kalshi' | 'arbitrage';

function App() {
    const [matches, setMatches] = useState<MarketMatch[]>([]);
    const [isMatching, setIsMatching] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('arbitrage');

    const handleMatchComplete = (newMatches: MarketMatch[]) => {
        setMatches(newMatches);
        setIsMatching(false);
        // Auto-switch to arbitrage tab on search completion
        if (newMatches.length > 0) {
            setActiveTab('arbitrage');
        }
    };

    return (
        <div className={styles.app}>
            {/* Left Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.brand}>
                    <h1>ArbiDex</h1>
                </div>
                <div className={styles.sidebarContent}>
                    <MatchingPanel
                        onMatchStart={() => setIsMatching(true)}
                        onMatchComplete={handleMatchComplete}
                        isMatching={isMatching}
                    />
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={styles.main}>
                {/* Tabs Navigation */}
                <nav className={styles.tabsNav}>
                    <button 
                        className={`${styles.tabButton} ${activeTab === 'polymarket' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('polymarket')}
                    >
                        Polymarket Feed
                    </button>
                    <button 
                        className={`${styles.tabButton} ${activeTab === 'kalshi' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('kalshi')}
                    >
                        Kalshi Feed
                    </button>
                    <button 
                        className={`${styles.tabButton} ${activeTab === 'arbitrage' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('arbitrage')}
                    >
                        Arbitrage Opportunities {matches.length > 0 && `(${matches.length})`}
                    </button>
                </nav>

                {/* Tab Content */}
                <div className={styles.tabContent}>
                    {activeTab === 'polymarket' && <PolymarketTable />}
                    
                    {activeTab === 'kalshi' && <KalshiTable />}
                    
                    {activeTab === 'arbitrage' && (
                        <MatchResults matches={matches} />
                    )}
                </div>
            </main>
        </div>
    );
}

export default App;
