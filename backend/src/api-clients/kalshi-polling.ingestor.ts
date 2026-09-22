import chalk from 'chalk';
import { KalshiPollingClient } from './kalshi.polling.client';
import { MarketData, PostgresClient } from '../database/postgres.client';
import { SweepListener } from '../types/ingestion';

export class KalshiPollingIngestor {
    private client: KalshiPollingClient;

    constructor(intervalMs: number, maxPages: number, onSweep?: SweepListener) {
        const saveBatch = async (markets: MarketData[]) => {
            try {
                await PostgresClient.saveKalshiMarkets(markets);
                console.log(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.green(`Saved ${markets.length} markets.`));
                onSweep?.(markets.length);
            } catch (e) {
                console.error(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.red('Postgres write failed:'), e);
                onSweep?.(0, e instanceof Error ? e.message : String(e));
            }
        };
        this.client = new KalshiPollingClient(saveBatch, intervalMs, maxPages, (msg) => onSweep?.(0, msg));
    }

    public start() {
        if (this.client.isPolling()) return;
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
