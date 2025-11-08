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
            const response = await fetch('/api/polymarket?limit=50');
            const result = await response.json();
            
            if (result.success) {
                setData(result.data);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Polymarket Markets</h2>
                <div className={styles.loading}>Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Polymarket Markets</h2>
                <div className={styles.error}>Error: {error}</div>
            </div>
        );
    }

    return (
        <div className={styles.tableContainer}>
            <div className={styles.tableHeader}>
                <h2 className={styles.tableTitle}>Polymarket Markets</h2>
                <button onClick={fetchData} className={styles.refreshButton}>
                    Refresh
                </button>
            </div>
            
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Market Name</th>
                            <th>Price</th>
                            <th>Volume</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((record) => (
                            <tr key={record.id}>
                                <td className={styles.marketName}>
                                    <div className={styles.name}>{record.title || record.ticker}</div>
                                    {record.outcome && (
                                        <div className={styles.outcome}>{record.outcome}</div>
                                    )}
                                </td>
                                <td className={styles.price}>${record.price.toFixed(4)}</td>
                                <td className={styles.volume}>{record.volume.toLocaleString()}</td>
                                <td className={styles.timestamp}>
                                    {new Date(record.timestamp * 1000).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className={styles.tableFooter}>
                Total records: {data.length}
            </div>
        </div>
    );
}