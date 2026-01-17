import chalk from 'chalk';
import { KalshiPollingClient, KalshiPollingUpdate } from './kalshi.polling.client';
import { MarketData, PostgresClient } from '../database/postgres.client';

/**
 * This function handles every market update received from polling
 * and persists it to the database using the provided PostgresClient.
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

    console.log(
        chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), 
        chalk.cyan(`Processing update for ${dataToSave.title || dataToSave.ticker}.`),
        chalk.white(`Price: $${dataToSave.price.toFixed(4)}`)
    );
    
    try {
        const lastID = PostgresClient.saveKalshiData(dataToSave);
        console.log(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.green(`Successfully saved. Row ID: ${lastID}`));
    } catch (e) {
        console.error(
            chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), 
            chalk.red(`Postgres write failed for market ${dataToSave.ticker}:`), 
            e
        );
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
        console.log(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.cyan('Starting Kalshi Polling Ingestor...'));
        this.client.startPolling();
    }

    public stop() {
        this.client.stopPolling();
        console.log(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.green('Kalshi Polling Ingestor stopped.'));
    }

    public isRunning(): boolean {
        return this.client.isPolling();
    }
}