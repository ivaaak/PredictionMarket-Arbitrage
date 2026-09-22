import chalk from 'chalk';
import { PolymarketPollingClient } from './polymarket.client';
import { PostgresClient, MarketData } from '../database/postgres.client';
import { SweepListener } from '../types/ingestion';

export class PolymarketIngestor {
    private client: PolymarketPollingClient;

    constructor(intervalMs: number, maxPages: number, onSweep?: SweepListener) {
        const saveBatch = async (markets: MarketData[]) => {
            try {
                await PostgresClient.savePolymarketMarkets(markets);
                console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.green(`Saved ${markets.length} markets.`));
                onSweep?.(markets.length);
            } catch (e) {
                console.error(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.red('Postgres write failed:'), e);
                onSweep?.(0, e instanceof Error ? e.message : String(e));
            }
        };
        this.client = new PolymarketPollingClient(saveBatch, intervalMs, maxPages, (msg) => onSweep?.(0, msg));
    }

    public start() {
        if (this.client.isPolling()) return;
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.cyan('Starting Polymarket Ingestor...'));
        this.client.startPolling();
    }

    public stop() {
        this.client.stopPolling();
        console.log(chalk.magenta.bold('[INGEST-POLYMARKET]'), chalk.green('Polymarket Ingestor stopped.'));
    }

    public isRunning(): boolean {
        return this.client.isPolling();
    }
}
