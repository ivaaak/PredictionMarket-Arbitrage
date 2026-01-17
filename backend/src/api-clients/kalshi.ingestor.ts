import { MarketData, PostgresClient } from '../database/postgres.client';
import { KalshiClient } from './kalshi.client';
import { OutgoingHttpHeaders } from 'http';

// The type of data coming directly from the WebSocket client
interface KalshiUpdate { 
    ticker_name: string;
    price: number;
    volume: number;
    title?: string;
    subtitle?: string;
}

/**
 * This function handles every new price/trade update received from the WebSocket
 * and persists it to the database using the provided PostgresClient.
 */
const handleMarketUpdate = (data: KalshiUpdate) => {
    // 1. Map the incoming Kalshi data to the required MarketData interface
    const dataToSave: MarketData = {
        ticker: data.ticker_name,
        source: 'Kalshi_WS',
        price: data.price,
        volume: data.volume,
        timestamp: Math.floor(Date.now() / 1000),
        title: data.title,
        subtitle: data.subtitle
    };

    console.log(`[INGEST-KALSHI] Processing update for ${dataToSave.title || dataToSave.ticker}. Price: $${dataToSave.price.toFixed(4)}`);
    
    // 2. Use your exported client method to save the data
    try {
        const lastID = PostgresClient.saveKalshiData(dataToSave);
        console.log(`[DB] Successfully saved Kalshi data. Row ID: ${lastID}`);
    } catch (e) {
        console.error(`[DB ERROR] Postgres write failed for Kalshi market ${dataToSave.ticker}:`, e);
    }
};

export class KalshiIngestor {
    private client: KalshiClient;

    /**
     * Constructor now accepts optional auth headers for Kalshi WebSocket connection.
     * No market tickers needed since we're tracking ALL markets.
     */
    constructor(authHeaders?: OutgoingHttpHeaders) {
        this.client = new KalshiClient(handleMarketUpdate, authHeaders);
    }

    /**
     * Starts the Kalshi WebSocket connection to track ALL markets.
     */
    public start() {
        console.log('[INGEST-KALSHI] Starting Kalshi WebSocket Ingestor for ALL markets...');
        this.client.startDataFeed();
    }

    public stop() {
        this.client.disconnect();
        console.log('[INGEST-KALSHI] Kalshi Ingestor stopped.');
    }
}