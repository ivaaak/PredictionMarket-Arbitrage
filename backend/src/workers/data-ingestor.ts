import { parentPort, workerData } from 'worker_threads';
import chalk from 'chalk';
import { SQLiteClient } from '../database/sqlite.client';
import { PolymarketIngestor } from '../api-clients/polymarket.ingestor';
import { KalshiPollingIngestor } from '../api-clients/kalshi-polling.ingestor';
import { PostgresClient } from '../database/postgres.client';

let polymarketIngestor: PolymarketIngestor;
let kalshiIngestor: KalshiPollingIngestor;

/**
 * The main function that initializes the database and starts all
 * the dedicated ingestor services (runs inside the worker thread).
 */
async function startIngestorWorker() {
    console.log(chalk.cyan.bold('[WORKER]'), chalk.white('Starting Data Ingestor Worker (Worker Thread)'));

    try {
        // 1. Initialize Database (ensures connection is ready for the worker thread)
        // await SQLiteClient.initialize();
        await PostgresClient.initialize();

        console.log(chalk.cyan.bold('[WORKER]'), chalk.yellow('📊 Starting ingestors to track ALL markets from both exchanges.'));

        // 2. Start Kalshi Polling Ingestor
        const pollingInterval = workerData?.kalshiPollingInterval || 5000;
        kalshiIngestor = new KalshiPollingIngestor(pollingInterval);
        kalshiIngestor.start();
        
        // 3. Start Polymarket Ingestor
        polymarketIngestor = new PolymarketIngestor();
        polymarketIngestor.start();

        console.log(chalk.cyan.bold('[WORKER]'), chalk.green('✅ All ingestors started successfully. Streaming all market data...'));
        
        // Notify the main thread that the worker is ready
        parentPort?.postMessage({ status: 'ready', message: 'Ingestors started.' });

    } catch (error) {
        console.error(chalk.cyan.bold('[WORKER]'), chalk.red('🚨 Fatal Error starting Data Ingestor Worker:'), error);
        // Notify the main thread of the error and terminate the worker
        parentPort?.postMessage({ status: 'error', message: 'Failed to start ingestors.', error: error instanceof Error ? error.message : 'Unknown error' });
        process.exit(1); 
    }
}

/**
 * Handles the stop signal sent from the main thread.
 */
function stopIngestorWorker() {
    console.log(chalk.cyan.bold('[WORKER]'), chalk.yellow('Received stop signal. Shutting down ingestors...'));
    
    if (polymarketIngestor) {
        polymarketIngestor.stop();
    }
    
    if (kalshiIngestor) {
        kalshiIngestor.stop();
    }
    
    console.log(chalk.cyan.bold('[WORKER]'), chalk.green('All ingestors stopped. Exiting worker thread.'));
    process.exit(0);
}

// Listen for termination signals from the main thread
parentPort?.on('message', (message) => {
    if (message === 'stop') {
        stopIngestorWorker();
    }
});

// Start the ingestion process when the worker thread initializes
startIngestorWorker();