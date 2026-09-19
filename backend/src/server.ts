import express from 'express';
import { Worker } from 'worker_threads';
import path from 'path';
import chalk from 'chalk';
import { PORT, ENABLE_INGESTOR, KALSHI_POLLING_INTERVAL_MS } from './config';
import { PostgresClient } from './database/postgres.client';
import { closePool } from './database/pool';
import polymarketRoutes from './controller/polymarket.controller';
import kalshiRoutes from './controller/kalshi.controller';
import matchingRoutes from './controller/matching.controller';
import resultRoutes from './controller/results.controller';

// Dedicated I/O worker for data ingestion/streaming.
let ingestorWorker: Worker | null = null;

/**
 * Spawns a new worker thread to handle all market data ingestion.
 * This keeps the main thread (API server) unblocked and responsive.
 */
function startIngestorWorkerThread() {
    console.log(chalk.blue.bold('[MAIN]'), chalk.cyan('Spawning Data Ingestor Worker Thread...'));

    // Under ts-node this module is a .ts file and the worker needs the ts-node
    // hook; after `npm run build` it is a .js file in dist/ and must not get it.
    const isTypeScript = __filename.endsWith('.ts');
    const workerPath = path.resolve(__dirname, 'workers', `data-ingestor${isTypeScript ? '.ts' : '.js'}`);

    ingestorWorker = new Worker(workerPath, {
        workerData: { kalshiPollingInterval: KALSHI_POLLING_INTERVAL_MS },
        execArgv: isTypeScript ? ['--require', 'ts-node/register'] : []
    });

    ingestorWorker.on('message', (message) => {
        if (message.status === 'ready') {
            console.log(chalk.blue.bold('[MAIN]'), chalk.green(`Ingestor Worker Status: ${message.message}`));
        } else if (message.status === 'error') {
            console.error(chalk.blue.bold('[MAIN]'), chalk.red(`Ingestor Worker Error: ${message.error}`));
        }
    });

    ingestorWorker.on('error', (err) => {
        console.error(chalk.blue.bold('[MAIN]'), chalk.red('Ingestor Worker encountered a fatal error:'), err);
    });

    ingestorWorker.on('exit', (code) => {
        if (code !== 0) {
            console.error(chalk.blue.bold('[MAIN]'), chalk.red(`Ingestor Worker stopped with exit code ${code}.`));
        } else {
            console.log(chalk.blue.bold('[MAIN]'), chalk.green('Ingestor Worker gracefully shut down.'));
        }
        ingestorWorker = null;
    });
}

/**
 * Sends a stop signal to the worker thread to initiate a clean shutdown.
 */
function stopIngestorWorkerThread() {
    if (ingestorWorker) {
        console.log(chalk.blue.bold('[MAIN]'), chalk.yellow('Sending stop signal to Data Ingestor Worker...'));
        ingestorWorker.postMessage('stop');
        setTimeout(() => {
            if (ingestorWorker) {
                console.warn(chalk.blue.bold('[MAIN]'), chalk.red('Ingestor Worker did not shut down in time. Terminating forcefully.'));
                ingestorWorker.terminate();
            }
        }, 5000);
    }
}

async function startServer() {
    // Create the tables before anything serves traffic. The ingestor worker also
    // calls this, but the API must not depend on the worker being enabled.
    await PostgresClient.initialize();

    if (ENABLE_INGESTOR) {
        startIngestorWorkerThread();
    } else {
        console.log(chalk.blue.bold('[MAIN]'), chalk.yellow('Ingestor disabled (ENABLE_INGESTOR=false). Serving existing data only.'));
    }

    const app = express();
    app.use(express.json());

    // Register standard API routes
    app.use('/api/polymarket', polymarketRoutes);
    app.use('/api/kalshi', kalshiRoutes);
    app.use('/api/matching', matchingRoutes);
    app.use('/api/results', resultRoutes);

    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'healthy',
            ingestorRunning: ingestorWorker !== null,
            timestamp: new Date().toISOString()
        });
    });

    const server = app.listen(PORT, () => {
        console.log(chalk.green.bold(`✓ Server running on port ${PORT}`));
    });

    // Handle graceful shutdown of the server and the workers
    let shuttingDown = false;
    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        console.log(chalk.blue.bold('\n[MAIN]'), chalk.yellow(`${signal} signal received. Shutting down gracefully...`));
        stopIngestorWorkerThread();

        server.close(async () => {
            console.log(chalk.blue.bold('[MAIN]'), chalk.green('HTTP server closed.'));
            await closePool().catch(() => undefined);
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
    console.error(chalk.red.bold('[MAIN]'), chalk.red('Failed to start server:'), error);
    process.exit(1);
});
