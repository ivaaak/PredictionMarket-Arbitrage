import chalk from 'chalk';
import { PolymarketClient } from './polymarket.client';
import { PostgresClient, MarketData } from '../database/postgres.client';

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
 * and persists it to the database using the provided PostgresClient.
 */
const handleMarketUpdate = async (data: PolymarketUpdate) => {
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

    console.log(
        chalk.magenta.bold('[INGEST-POLYMARKET]'), 
        chalk.cyan(`Processing trade for ${data.title || dataToSave.ticker}.`),
        chalk.white(`Price: $${dataToSave.price.toFixed(4)}, Volume: $${dataToSave.volume.toFixed(0)}`)
    );
    
    // 2. Use your exported client method to save the data
    try {
        await PostgresClient.savePolymarketData(dataToSave);
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.green(`Successfully saved ${dataToSave.ticker}.`));
    } catch (e) {
        console.error(
            chalk.magenta.bold('[INGEST-POLYMARKET]'), 
            chalk.red(`Postgres write failed for market ${dataToSave.ticker}:`), 
            e
        );
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
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.cyan('Starting Polymarket WebSocket Ingestor for ALL markets...'));
        this.client.startDataFeed();
    }

    public stop() {
        this.client.disconnect();
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.green('Polymarket Ingestor stopped.'));
    }
}