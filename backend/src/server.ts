import express from 'express';
import { Worker } from 'worker_threads';
import path from 'path';
import { WorkerPool } from './worker-pool';

import { PORT } from './config';
import { SQLiteClient } from '../src/database/sqlite.client';
import polymarketRoutes from './controller/polymarket.controller';
import kalshiRoutes from './controller/kalshi.controller';
import matchingRoutes from './controller/matching.controller';

// Dedicated I/O Worker (for data ingestion/streaming)
let ingestorWorker: Worker | null = null;

// CPU-bound Worker Pool (for heavy calculations)
let taskWorkerPool: WorkerPool | null = null;
const TASK_WORKER_SCRIPT = path.join(__dirname, 'workers', 'task-worker.ts');

/**
 * Spawns a new worker thread to handle all market data ingestion.
 * This keeps the main thread (API server) unblocked and responsive.
 */
function startIngestorWorkerThread() {
    console.log('[MAIN] Spawning Data Ingestor Worker Thread...');

    // IMPORTANT: The path must point to the worker script file.
    const workerPath = path.resolve(__dirname, 'workers', 'data-ingestor.ts');
    
    // Optional: Pass configuration data to the worker
    const workerData = { kalshiPollingInterval: 5000 };

    ingestorWorker = new Worker(workerPath, {
        workerData: workerData,
    });

    ingestorWorker.on('message', (message) => {
        if (message.status === 'ready') {
            console.log(`[MAIN] Ingestor Worker Status: ${message.message}`);
        } else if (message.status === 'error') {
            console.error(`[MAIN] Ingestor Worker Error: ${message.error}`);
        }
    });

    ingestorWorker.on('error', (err) => {
        console.error('[MAIN] Ingestor Worker encountered a fatal error:', err);
    });

    ingestorWorker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`[MAIN] Ingestor Worker stopped with exit code ${code}.`);
        } else {
            console.log('[MAIN] Ingestor Worker gracefully shut down.');
        }
        ingestorWorker = null;
    });
}

/**
 * Sends a stop signal to the worker thread to initiate a clean shutdown.
 */
function stopIngestorWorkerThread() {
    if (ingestorWorker) {
        console.log('[MAIN] Sending stop signal to Data Ingestor Worker...');
        ingestorWorker.postMessage('stop');
        // Set a timeout for forceful termination in case the worker gets stuck
        setTimeout(() => {
            if (ingestorWorker) {
                console.warn('[MAIN] Ingestor Worker did not shut down in time. Terminating forcefully.');
                ingestorWorker.terminate();
            }
        }, 5000); 
    }
}

/**
 * Initializes the CPU-bound task worker pool.
 */
function startWorkerPool() {
    // Initialize the pool, using a default worker count based on CPU cores
    taskWorkerPool = new WorkerPool(TASK_WORKER_SCRIPT);
    
    // Example: Run a test task immediately after startup
    taskWorkerPool.runTask({ value: 50 }).then((result: any) => {
        console.log('[MAIN] Test Pool Task Completed:', result);
    }).catch(err => {
        console.error('[MAIN] Test Pool Task Failed:', err);
    });
}

/**
 * Terminates the CPU-bound task worker pool gracefully.
 */
async function stopWorkerPool() {
    if (taskWorkerPool) {
        await taskWorkerPool.terminate();
    }
}


async function startServer() {
    // Initialize DB client for the main thread (for API reads/writes)
    SQLiteClient.initialize();
    
    // Start data ingestion in a separate thread (I/O-bound)
    startIngestorWorkerThread();

    // Start the CPU-bound task pool
    startWorkerPool();

    const app = express();
    app.use(express.json());

    // Register standard API routes
    app.use('/api/polymarket', polymarketRoutes);
    app.use('/api/kalshi', kalshiRoutes);
    app.use('/api/matching', matchingRoutes);

    // NEW: Example route for testing the Worker Pool
    app.post('/api/heavy-task', async (req, res) => {
        const { input } = req.body;
        if (!taskWorkerPool) return res.status(503).send('Worker pool not available.');

        // Input validation example
        const inputValue = input && !isNaN(parseInt(input, 10)) ? parseInt(input, 10) : 100;

        try {
            console.log(`[MAIN] Receiving heavy task request for value ${inputValue}...`);
            // Run the task using the pool, awaiting the result
            const result = await taskWorkerPool.runTask({ value: inputValue });
            res.json({ status: 'Job processed successfully', result });
        } catch (error: any) {
            res.status(500).json({ status: 'Job failed', error: error.message });
        }
    });


    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    // Handle graceful shutdown of the server and the workers
    process.on('SIGTERM', () => {
        console.log('\n[MAIN] SIGTERM signal received. Shutting down gracefully...');
        server.close(async () => {
            stopIngestorWorkerThread(); // Signal I/O worker to stop
            await stopWorkerPool();     // Terminate the CPU pool
            console.log('[MAIN] HTTP server closed.');
            process.exit(0);
        });
    });
}

startServer();