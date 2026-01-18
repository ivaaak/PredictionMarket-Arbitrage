import { useState, useEffect } from 'react';
import styles from './DataTable.module.css';
import { PolymarketDataRecord } from '../types';

export function PolymarketTable() {
    const [data, setData] = useState<PolymarketDataRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/polymarket?limit=50');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && Array.isArray(result.data)) {
                setData(result.data);
            } else if (Array.isArray(result)) {
                setData(result);
            } else {
                setError(result.error || 'Invalid data format received');
                setData([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.tableContainer}>
                <div className={styles.loading}>Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.tableContainer}>
                <div className={styles.error}>Error: {error}</div>
            </div>
        );
    }

    return (
        <div className={styles.tableContainer}>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Market Name</th>
                            <th>Outcome</th>
                            <th>Source</th>
                            <th>Price</th>
                            <th>Volume</th>
                            <th>Activity</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={8} className={styles.noData}>
                                    No data available
                                </td>
                            </tr>
                        ) : (
                            data.map((record) => (
                                <tr key={record.id}>
                                    <td className={styles.idCell}>
                                        <span className={styles.badge}>{record.id}</span>
                                    </td>
                                    <td className={styles.marketName}>
                                        <div className={styles.name}>{record.title || record.ticker}</div>
                                        <div className={styles.ticker}>{record.ticker}</div>
                                    </td>
                                    <td className={styles.outcomeCell}>
                                        {record.outcome && (
                                            <span className={styles.outcomeBadge}>
                                                {record.outcome}
                                            </span>
                                        )}
                                    </td>
                                    <td className={styles.sourceCell}>
                                        <span className={styles.sourceBadge}>
                                            {record.source}
                                        </span>
                                    </td>
                                    <td className={styles.priceCell}>
                                        <span className={styles.priceValue}>
                                            ${Number(record.price).toFixed(2)}
                                        </span>
                                        {Number(record.price) > 0 && (
                                            <span className={styles.priceIndicator}>●</span>
                                        )}
                                    </td>
                                    <td className={styles.volumeCell}>
                                        {Number(record.volume).toLocaleString()}
                                    </td>
                                    <td className={styles.activityCell}>
                                        {Number(record.volume) > 0 ? (
                                            <span className={styles.activeIndicator}>
                                                <span className={styles.pulse}></span>
                                            </span>
                                        ) : (
                                            <span className={styles.activeIndicator}>
                                                <span className={styles.inactivePulse}></span>
                                            </span>
                                        )}
                                    </td>
                                    <td className={styles.timestamp}>
                                        {new Date(Number(record.timestamp) * 1000).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className={styles.tableFooter}>
                Total records: {data.length}
            </div>
        </div>
    );
}