import { PolymarketClient } from './polymarket.client';
import { SQLiteClient, MarketData } from '../database/sqlite.client';

// The type of data coming directly from the WebSocket client
interface PolymarketUpdate {
    marketId: string;
    price: number;
    volume: number;
    title?: string;
    outcome?: string;
    timestamp?: number;
}

/**
 * This function handles every new trade update received from the WebSocket
 * and persists it to the database using the provided SQLiteClient.
 */
const handleMarketUpdate = (data: PolymarketUpdate) => {
    // 1. Map the incoming Polymarket data to the required MarketData interface
    const dataToSave: MarketData = {
        ticker: data.marketId,
        source: 'Polymarket_WS',
        price: data.price,
        volume: data.volume,
        timestamp: data.timestamp ? Math.floor(data.timestamp / 1000) : Math.floor(Date.now() / 1000),
        title: data.title,
        outcome: data.outcome
    };

    console.log(`[INGEST-POLYMARKET] Processing trade for ${data.title || dataToSave.ticker}. Price: $${dataToSave.price.toFixed(4)}, Volume: $${dataToSave.volume.toFixed(0)}`);
    
    // 2. Use your exported client method to save the data
    try {
        const lastID = SQLiteClient.savePolymarketData(dataToSave);
        console.log(`[DB] Successfully saved Polymarket data. Row ID: ${lastID}`);
    } catch (e) {
        console.error(`[DB ERROR] SQLite write failed for Polymarket market ${dataToSave.ticker}:`, e);
    }
};

export class PolymarketIngestor {
    private client: PolymarketClient;

    /**
     * Constructor initializes the Polymarket client.
     * No market IDs needed since we're tracking ALL markets.
     */
    constructor() {
        this.client = new PolymarketClient(handleMarketUpdate);
    }

    /**
     * Starts the Polymarket WebSocket connection to track ALL markets.
     */
    public start() {
        console.log('[INGEST-POLYMARKET] Starting Polymarket WebSocket Ingestor for ALL markets...');
        this.client.startDataFeed();
    }

    public stop() {
        this.client.disconnect();
        console.log('[INGEST-POLYMARKET] Polymarket Ingestor stopped.');
    }
}