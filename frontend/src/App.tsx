import { useState } from 'react';
import styles from './App.module.css';
import { PolymarketTable } from './components/PolymarketTable';
import { KalshiTable } from './components/KalshiTable';
import { MatchingPanel } from './components/MatchingPanel';
import { MatchResults } from './components/MatchResults';
import { IngestionControl } from './components/IngestionControl';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { MarketMatch } from './types';

type Tab = 'polymarket' | 'kalshi' | 'arbitrage' | 'analytics';

const TABS: { id: Tab; label: string }[] = [
    { id: 'polymarket', label: '01 Polymarket' },
    { id: 'kalshi', label: '02 Kalshi' },
    { id: 'arbitrage', label: '03 Arbitrage' },
    { id: 'analytics', label: '04 Analytics' },
];

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

    const avgConfidence = matches.length
        ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
        : 0;

    return (
        <div className={styles.app}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.brand}>
                    <div className={styles.logo}>A</div>
                    <div>
                        <h1>arbit<span>Rage</span></h1>
                        <div className={styles.brandSub}>Polymarket · Kalshi · Cross-venue arbitrage</div>
                    </div>
                </div>
                <div className={styles.kpis}>
                    <div className={styles.kpi}>
                        <span className={styles.kpiLabel}>Pairs</span>
                        <span className={styles.kpiValue}>{matches.length}</span>
                    </div>
                    <div className={styles.kpi}>
                        <span className={styles.kpiLabel}>Avg Conf</span>
                        <span className={`${styles.kpiValue} ${styles.kpiAccent}`}>
                            {(avgConfidence * 100).toFixed(1)}%
                        </span>
                    </div>
                    <div className={styles.kpi}>
                        <span className={styles.kpiLabel}>Engine</span>
                        <span className={styles.kpiValue}>{isMatching ? 'RUN' : 'IDLE'}</span>
                    </div>
                </div>
            </header>

            {/* Tabs Navigation */}
            <nav className={styles.tabsNav}>
                <div className={styles.tabsMeta}>
                    View <b>{TABS.find(t => t.id === activeTab)?.label}</b> · Live pairs <b>{matches.length}</b>
                </div>
                <div className={styles.tabs}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            {tab.id === 'arbitrage' && matches.length > 0 && ` (${matches.length})`}
                        </button>
                    ))}
                </div>
            </nav>

            <div className={styles.body}>
                {/* Left Sidebar */}
                <aside className={styles.sidebar}>
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitle}>Control Panel</div>
                        <div className={styles.panelSub}>Ingest → Match → Filter → Save</div>
                    </div>
                    <div className={styles.sidebarContent}>
                        <IngestionControl />
                        <MatchingPanel
                            onMatchStart={() => setIsMatching(true)}
                            onMatchComplete={handleMatchComplete}
                            isMatching={isMatching}
                        />
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className={styles.main}>
                    <div className={styles.tabContent}>
                        {activeTab === 'polymarket' && <PolymarketTable />}

                        {activeTab === 'kalshi' && <KalshiTable />}

                        {activeTab === 'arbitrage' && (
                            <MatchResults matches={matches} />
                        )}

                        {activeTab === 'analytics' && <AnalyticsDashboard liveMatches={matches} />}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
