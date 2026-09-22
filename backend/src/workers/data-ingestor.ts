import { parentPort, workerData } from 'worker_threads';
import chalk from 'chalk';
import { PolymarketIngestor } from '../api-clients/polymarket.ingestor';
import { KalshiPollingIngestor } from '../api-clients/kalshi-polling.ingestor';
import { PostgresClient } from '../database/postgres.client';
import {
    KALSHI_MAX_PAGES,
    KALSHI_POLLING_INTERVAL_MS,
    POLYMARKET_MAX_PAGES,
    POLYMARKET_POLLING_INTERVAL_MS
} from '../config';
import { IngestionSource, IngestionStatus, IngestorCommand, IngestorEvent, SourceStatus, SweepReport } from '../types/ingestion';

interface Ingestor {
    start(): void;
    stop(): void;
    isRunning(): boolean;
}

const intervals: Record<IngestionSource, number> = {
    polymarket: workerData?.polymarketPollingInterval || POLYMARKET_POLLING_INTERVAL_MS,
    kalshi: workerData?.kalshiPollingInterval || KALSHI_POLLING_INTERVAL_MS
};

const emptyStatus = (source: IngestionSource): SourceStatus => ({
    running: false,
    intervalMs: intervals[source],
    sweeps: 0,
    lastSweepAt: null,
    lastSweepCount: null,
    lastRejected: null,
    lastRejectedByReason: null,
    lastPruned: null,
    lastError: null,
    lastErrorAt: null
});

const state: IngestionStatus = {
    polymarket: emptyStatus('polymarket'),
    kalshi: emptyStatus('kalshi')
};

const post = (event: IngestorEvent) => parentPort?.postMessage(event);
const publishState = () => post({ status: 'state', state });

const onSweep = (source: IngestionSource) => (report: SweepReport | null, error?: string) => {
    const s = state[source];
    if (error || !report) {
        // Keep the last good sweep's numbers; the error is shown alongside them.
        s.lastError = error ?? 'Unknown error';
        s.lastErrorAt = new Date().toISOString();
    } else {
        s.sweeps += 1;
        s.lastSweepAt = new Date().toISOString();
        s.lastSweepCount = report.saved;
        s.lastRejectedByReason = report.rejected;
        s.lastRejected = Object.values(report.rejected).reduce((a, b) => a + b, 0);
        s.lastPruned = report.pruned;
        s.lastError = null;
    }
    publishState();
};

const ingestors: Record<IngestionSource, Ingestor> = {
    polymarket: new PolymarketIngestor(intervals.polymarket, POLYMARKET_MAX_PAGES, onSweep('polymarket')),
    kalshi: new KalshiPollingIngestor(intervals.kalshi, KALSHI_MAX_PAGES, onSweep('kalshi'))
};

function setSource(source: IngestionSource, enabled: boolean) {
    const ingestor = ingestors[source];
    if (enabled) ingestor.start();
    else ingestor.stop();
    state[source].running = ingestor.isRunning();
    console.log(chalk.cyan.bold('[WORKER]'), chalk.white(`${source} ingestion ${enabled ? 'enabled' : 'disabled'}`));
    publishState();
}

/**
 * Initializes the database and starts whichever ingestors the main thread
 * asked for at spawn time (runs inside the worker thread). The rest can be
 * toggled later through 'set' commands.
 */
async function startIngestorWorker() {
    console.log(chalk.cyan.bold('[WORKER]'), chalk.white('Starting Data Ingestor Worker (Worker Thread)'));

    try {
        await PostgresClient.initialize();

        const autoStart: IngestionSource[] = workerData?.autoStart ?? [];
        autoStart.forEach(source => setSource(source, true));

        post({ status: 'ready', message: `Ingestor worker ready (running: ${autoStart.join(', ') || 'none'}).` });
        publishState();
    } catch (error) {
        console.error(chalk.cyan.bold('[WORKER]'), chalk.red('🚨 Fatal Error starting Data Ingestor Worker:'), error);
        post({ status: 'error', message: 'Failed to start ingestors.', error: error instanceof Error ? error.message : 'Unknown error' });
        process.exit(1);
    }
}

function shutdown() {
    console.log(chalk.cyan.bold('[WORKER]'), chalk.yellow('Received shutdown signal. Stopping ingestors...'));
    Object.values(ingestors).forEach(i => i.stop());
    console.log(chalk.cyan.bold('[WORKER]'), chalk.green('All ingestors stopped. Exiting worker thread.'));
    process.exit(0);
}

parentPort?.on('message', (command: IngestorCommand) => {
    if (command.type === 'shutdown') shutdown();
    else if (command.type === 'set') setSource(command.source, command.enabled);
});

startIngestorWorker();
