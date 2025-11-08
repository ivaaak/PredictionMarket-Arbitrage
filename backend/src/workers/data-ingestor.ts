import { SQLiteClient } from '../database/sqlite.client';
import { PolymarketIngestor } from '../api-clients/polymarket.ingestor';
import { KalshiPollingIngestor } from '../api-clients/kalshi-polling.ingestor';

let polymarketIngestor: PolymarketIngestor;
let kalshiIngestor: KalshiPollingIngestor;

/**
 * The main worker function that initializes the database and starts all
 * the dedicated WebSocket ingestor services to track ALL markets from both exchanges.
 */
export async function startIngestorWorker() {
    console.log('[WORKER] Starting Data Ingestor Worker (WebSocket Streaming - ALL MARKETS) ---');

    try {
        // 1. Initialize Database (ensures connection is ready)
        await SQLiteClient.initialize();

        console.log('[WORKER] 📊 Starting ingestors to track ALL markets from both exchanges.');
        
        // 2. Start Kalshi Ingestor
        // Option A: With authentication
        // const kalshiIngestor = new KalshiIngestor();
        // kalshiIngestor.start();

        // Option B: Start Kalshi polling ingestor (polls every 5 seconds)
        const kalshiIngestor = new KalshiPollingIngestor(5000);
        kalshiIngestor.start();


        // 3. Start Polymarket Ingestor (no specific markets - will track all)
        const polymarketIngestor = new PolymarketIngestor();
        polymarketIngestor.start();

        console.log('[WORKER] ✅ All ingestors started successfully. Streaming all market data...');

    } catch (error) {
        console.error('[WORKER] 🚨 Fatal Error starting Data Ingestor Worker:', error);
        process.exit(1); 
    }
}

export function stopIngestorWorker() {
    console.log('[WORKER] Stopping data ingestor worker...');
    
    if (polymarketIngestor) {
        polymarketIngestor.stop();
    }
    
    if (kalshiIngestor) {
        kalshiIngestor.stop();
    }
    
    console.log('[WORKER] All ingestors stopped');
}