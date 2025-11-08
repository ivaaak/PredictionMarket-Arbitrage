import { SQLiteClient } from '../database/sqlite.client';
import { KalshiIngestor } from '../api-clients/kalshi.ingestor';
import { PolymarketIngestor } from '../api-clients/polymarket.ingestor';

/**
 * The main worker function that initializes the database and starts all
 * the dedicated WebSocket ingestor services to track ALL markets from both exchanges.
 */
export async function startIngestorWorker() {
    console.log('--- Starting Data Ingestor Worker (WebSocket Streaming - ALL MARKETS) ---');

    try {
        // 1. Initialize Database (ensures connection is ready)
        await SQLiteClient.initialize();

        console.log('📊 Starting ingestors to track ALL markets from both exchanges.');
        
        // 2. Start Kalshi Ingestor
        // Option A: Without authentication (may have limited access or fail)
        const kalshiIngestor = new KalshiIngestor();
        kalshiIngestor.start();

        // Option B: With authentication (uncomment and provide your credentials)
        // const kalshiAuthHeaders = {
        //     'KALSHI-ACCESS-KEY': process.env.KALSHI_API_KEY || '',
        //     'KALSHI-ACCESS-SIGNATURE': process.env.KALSHI_API_SIGNATURE || '',
        //     'KALSHI-ACCESS-TIMESTAMP': Date.now().toString()
        // };
        // const kalshiIngestor = new KalshiIngestor(kalshiAuthHeaders);
        // kalshiIngestor.start();

        // 3. Start Polymarket Ingestor (no specific markets - will track all)
        const polymarketIngestor = new PolymarketIngestor();
        polymarketIngestor.start();

        console.log('✅ All ingestors started successfully. Streaming all market data...');

    } catch (error) {
        console.error('🚨 Fatal Error starting Data Ingestor Worker:', error);
        process.exit(1); 
    }
}