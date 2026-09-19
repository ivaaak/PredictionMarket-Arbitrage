import chalk from 'chalk';
import { KalshiPollingClient } from './kalshi.polling.client';
import { MarketData, PostgresClient } from '../database/postgres.client';

const saveBatch = async (markets: MarketData[]) => {
    try {
        await PostgresClient.saveKalshiMarkets(markets);
        console.log(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.green(`Saved ${markets.length} markets.`));
    } catch (e) {
        console.error(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.red('Postgres write failed:'), e);
    }
};

export class KalshiPollingIngestor {
    private client: KalshiPollingClient;

    constructor(intervalMs: number, maxPages: number) {
        this.client = new KalshiPollingClient(saveBatch, intervalMs, maxPages);
    }

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
