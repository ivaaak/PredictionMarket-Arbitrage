import chalk from 'chalk';
import { PolymarketPollingClient } from './polymarket.client';
import { PostgresClient, MarketData } from '../database/postgres.client';

const saveBatch = async (markets: MarketData[]) => {
    try {
        await PostgresClient.savePolymarketMarkets(markets);
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.green(`Saved ${markets.length} markets.`));
    } catch (e) {
        console.error(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.red('Postgres write failed:'), e);
    }
};

export class PolymarketIngestor {
    private client: PolymarketPollingClient;

    constructor(intervalMs: number, maxPages: number) {
        this.client = new PolymarketPollingClient(saveBatch, intervalMs, maxPages);
    }

    public start() {
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.cyan('Starting Polymarket Ingestor...'));
        this.client.startPolling();
    }

    public stop() {
        this.client.stopPolling();
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.green('Polymarket Ingestor stopped.'));
    }
}
