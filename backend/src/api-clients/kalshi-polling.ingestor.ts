import chalk from 'chalk';
import { KalshiPollingClient } from './kalshi.polling.client';
import { PostgresClient } from '../database/postgres.client';
import { INGEST_PRUNE_STALE } from '../config';
import { SweepBatch, SweepListener } from '../types/ingestion';

export class KalshiPollingIngestor {
    private client: KalshiPollingClient;

    constructor(intervalMs: number, maxPages: number, onSweep?: SweepListener) {
        const saveBatch = async (sweep: SweepBatch) => {
            try {
                // Pruning needs the whole catalogue: a sweep cut short by the
                // page cap would delete every market it simply did not reach.
                const pruned = await PostgresClient.saveKalshiMarkets(sweep.markets, INGEST_PRUNE_STALE && sweep.complete);
                console.log(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.green(`Saved ${sweep.markets.length} markets${pruned ? `, pruned ${pruned} stale` : ''}.`));
                onSweep?.({ saved: sweep.markets.length, rejected: sweep.rejected, pruned, complete: sweep.complete });
            } catch (e) {
                console.error(chalk.yellow.bold('[INGEST-KALSHI-POLLING]'), chalk.red('Postgres write failed:'), e);
                onSweep?.(null, e instanceof Error ? e.message : String(e));
            }
        };
        this.client = new KalshiPollingClient(saveBatch, intervalMs, maxPages, (msg) => onSweep?.(null, msg));
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
