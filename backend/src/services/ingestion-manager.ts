import { Worker } from 'worker_threads';
import path from 'path';
import chalk from 'chalk';
import { KALSHI_POLLING_INTERVAL_MS, POLYMARKET_POLLING_INTERVAL_MS } from '../config';
import { IngestionSource, IngestionStatus, IngestorCommand, IngestorEvent } from '../types/ingestion';

const TAG = chalk.blue.bold('[INGESTION]');

const idle = (intervalMs: number) => ({
    running: false, intervalMs, sweeps: 0, lastSweepAt: null, lastSweepCount: null, lastError: null, lastErrorAt: null
});

/**
 * Owns the dedicated ingestion worker thread. The worker keeps both venue
 * ingestors; this class only spawns it and relays start/stop commands, so the
 * API thread stays unblocked and the UI can toggle each venue independently.
 */
class IngestionManager {
    private worker: Worker | null = null;
    private ready: Promise<void> | null = null;
    private state: IngestionStatus = {
        polymarket: idle(POLYMARKET_POLLING_INTERVAL_MS),
        kalshi: idle(KALSHI_POLLING_INTERVAL_MS)
    };

    /** Spawns the worker (if needed) and starts the given sources. */
    start(autoStart: IngestionSource[] = []): Promise<void> {
        if (this.ready) return this.ready;

        console.log(TAG, chalk.cyan('Spawning Data Ingestor Worker Thread...'));

        // Under ts-node this module is a .ts file and the worker needs the ts-node
        // hook; after `npm run build` it is a .js file in dist/ and must not get it.
        const isTypeScript = __filename.endsWith('.ts');
        const workerPath = path.resolve(__dirname, '..', 'workers', `data-ingestor${isTypeScript ? '.ts' : '.js'}`);

        const worker = new Worker(workerPath, {
            workerData: {
                kalshiPollingInterval: KALSHI_POLLING_INTERVAL_MS,
                polymarketPollingInterval: POLYMARKET_POLLING_INTERVAL_MS,
                autoStart
            },
            execArgv: isTypeScript ? ['--require', 'ts-node/register'] : []
        });
        this.worker = worker;

        this.ready = new Promise((resolve, reject) => {
            worker.on('message', (message: IngestorEvent) => {
                if (message.status === 'state') {
                    this.state = message.state;
                } else if (message.status === 'ready') {
                    console.log(TAG, chalk.green(message.message));
                    resolve();
                } else if (message.status === 'error') {
                    console.error(TAG, chalk.red(`Ingestor Worker Error: ${message.error}`));
                    reject(new Error(message.error));
                }
            });

            worker.on('error', (err) => {
                console.error(TAG, chalk.red('Ingestor Worker encountered a fatal error:'), err);
                reject(err);
            });

            worker.on('exit', (code) => {
                if (code !== 0) console.error(TAG, chalk.red(`Ingestor Worker stopped with exit code ${code}.`));
                else console.log(TAG, chalk.green('Ingestor Worker gracefully shut down.'));
                this.worker = null;
                this.ready = null;
                this.state.polymarket.running = false;
                this.state.kalshi.running = false;
            });
        });
        // A failed spawn is reported to whoever awaits it; don't crash on an unobserved rejection.
        this.ready.catch(() => undefined);

        return this.ready;
    }

    getStatus(): IngestionStatus & { workerAlive: boolean } {
        return { ...this.state, workerAlive: this.worker !== null };
    }

    /** Turns one venue's ingestion on or off, spawning the worker on first use. */
    async setSource(source: IngestionSource, enabled: boolean): Promise<void> {
        if (!this.worker && !enabled) return;
        await this.start();
        this.send({ type: 'set', source, enabled });
        // Reflect the change immediately; the worker confirms with its next state message.
        this.state[source].running = enabled;
    }

    /** Sends the shutdown signal, terminating the worker if it does not exit in time. */
    shutdown(): void {
        const worker = this.worker;
        if (!worker) return;
        console.log(TAG, chalk.yellow('Sending stop signal to Data Ingestor Worker...'));
        this.send({ type: 'shutdown' });
        setTimeout(() => {
            if (this.worker === worker) {
                console.warn(TAG, chalk.red('Ingestor Worker did not shut down in time. Terminating forcefully.'));
                worker.terminate();
            }
        }, 5000);
    }

    private send(command: IngestorCommand) {
        this.worker?.postMessage(command);
    }
}

export const ingestionManager = new IngestionManager();
