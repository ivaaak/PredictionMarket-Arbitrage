import { KalshiPollingClient, KalshiPollingUpdate } from './kalshi.polling.client';
import { SQLiteClient, MarketData } from '../database/sqlite.client';

/**
 * This function handles every market update received from polling
 * and persists it to the database using the provided SQLiteClient.
 */
const handleMarketUpdate = (data: KalshiPollingUpdate) => {
    // Map the incoming Kalshi data to the required MarketData interface
    const dataToSave: MarketData = {
        ticker: data.ticker_name,
        source: 'Kalshi_Polling',
        price: data.price,
        volume: data.volume,
        timestamp: Math.floor(Date.now() / 1000),
        title: data.title,
        subtitle: data.subtitle
    };

    console.log(`[INGEST-KALSHI-POLLING] Processing update for ${dataToSave.title || dataToSave.ticker}. Price: $${dataToSave.price.toFixed(4)}`);
    
    try {
        const lastID = SQLiteClient.saveKalshiData(dataToSave);
        console.log(`[DB] Successfully saved Kalshi data. Row ID: ${lastID}`);
    } catch (e) {
        console.error(`[DB ERROR] SQLite write failed for Kalshi market ${dataToSave.ticker}:`, e);
    }
};

export class KalshiPollingIngestor {
    private client: KalshiPollingClient;

    /**
     * Constructor initializes the Kalshi polling client.
     * @param intervalMs - Polling interval in milliseconds (default: 30000 = 30 seconds)
     */
    constructor(intervalMs: number = 30000) {
        this.client = new KalshiPollingClient(handleMarketUpdate, intervalMs);
    }

    /**
     * Starts polling Kalshi API for market data
     */
    public start() {
        console.log('[INGEST-KALSHI-POLLING] Starting Kalshi Polling Ingestor...');
        this.client.startPolling();
    }

    public stop() {
        this.client.stopPolling();
        console.log('[INGEST-KALSHI-POLLING] Kalshi Polling Ingestor stopped.');
    }

    public isRunning(): boolean {
        return this.client.isPolling();
    }
}