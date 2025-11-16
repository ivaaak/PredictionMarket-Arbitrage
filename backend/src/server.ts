import express from 'express';
import { Worker } from 'worker_threads';
import path from 'path';
import chalk from 'chalk';
import { PORT } from './config';
import { SQLiteClient } from './database/sqlite.client';
import polymarketRoutes from './controller/polymarket.controller';
import kalshiRoutes from './controller/kalshi.controller';
import matchingRoutes from './controller/matching.controller';

// 1. Dedicated I/O Worker (for data ingestion/streaming)
let ingestorWorker: Worker | null = null;

// 2. CPU-bound Worker Pool - DISABLED
// let taskWorkerPool: WorkerPool | null = null;
// const TASK_WORKER_SCRIPT = path.resolve(__dirname, 'workers', 'task-worker.ts');

/**
 * Spawns a new worker thread to handle all market data ingestion.
 * This keeps the main thread (API server) unblocked and responsive.
 */
function startIngestorWorkerThread() {
    console.log(chalk.blue.bold('[MAIN]'), chalk.cyan('Spawning Data Ingestor Worker Thread...'));

    const workerPath = path.resolve(__dirname, 'workers', 'data-ingestor.ts');
    const workerData = { kalshiPollingInterval: 5000 };

    ingestorWorker = new Worker(workerPath, {
        workerData: workerData,
        execArgv: ['--require', 'ts-node/register']
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
    // Initialize DB client for the main thread (for API reads/writes)
    SQLiteClient.initialize();
    
    // Start data ingestion in a separate thread (I/O-bound)
    startIngestorWorkerThread();

    const app = express();
    app.use(express.json());

    // Register standard API routes
    app.use('/api/polymarket', polymarketRoutes);
    app.use('/api/kalshi', kalshiRoutes);
    app.use('/api/matching', matchingRoutes);

    const server = app.listen(PORT, () => {
        console.log(chalk.green.bold(`✓ Server running on port ${PORT}`));
    });

    // Handle graceful shutdown of the server and the workers
    process.on('SIGTERM', () => {
        console.log(chalk.blue.bold('\n[MAIN]'), chalk.yellow('SIGTERM signal received. Shutting down gracefully...'));
        server.close(() => {
            stopIngestorWorkerThread();
            console.log(chalk.blue.bold('[MAIN]'), chalk.green('HTTP server closed.'));
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log(chalk.blue.bold('\n[MAIN]'), chalk.yellow('SIGINT signal received. Shutting down gracefully...'));
        server.close(() => {
            stopIngestorWorkerThread();
            console.log(chalk.blue.bold('[MAIN]'), chalk.green('HTTP server closed.'));
            process.exit(0);
        });
    });
}

startServer();