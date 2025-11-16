import { Worker, WorkerOptions } from 'worker_threads';
import os from 'os';
import chalk from 'chalk';

// Define the interface for a task/job that will be executed by the pool
interface PoolTask {
    jobId: number;
    data: any;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
}

// Define the state of a single worker in the pool
interface PoolWorker {
    worker: Worker;
    isBusy: boolean;
}

/**
 * A reusable class to manage a fixed pool of Node.js Worker Threads.
 * It queues incoming tasks and distributes them to the first available worker.
 */
export class WorkerPool {
    private readonly workerPath: string;
    private readonly maxWorkers: number;
    private workers: PoolWorker[] = [];
    private taskQueue: PoolTask[] = [];
    private nextJobId: number = 1;

    /**
     * @param workerPath The path to the worker script file (e.g., './workers/task-worker.ts').
     * @param maxWorkers The maximum number of threads to maintain in the pool. Defaults to CPU count.
     */
    constructor(workerPath: string, maxWorkers?: number) {
        this.workerPath = workerPath;
        this.maxWorkers = maxWorkers || os.cpus().length;
        this.initializeWorkers();
        console.log(chalk.magenta.bold('[PoolManager]'), chalk.green(`Initialized Worker Pool with ${this.maxWorkers} workers.`));
    }

    /**
     * Creates and initializes the worker threads.
     */
    private initializeWorkers(): void {
        const workerOptions: WorkerOptions = {
            // In a real project, consider using ts-node or a compiled JS path
            // For now, we assume the script is runnable.
        };

        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(this.workerPath, workerOptions);
            const poolWorker: PoolWorker = { worker, isBusy: false };
            this.workers.push(poolWorker);
            this.setupWorkerListeners(poolWorker);
        }
    }

    /**
     * Sets up event listeners for a worker to handle messages, errors, and exits.
     * @param poolWorker The worker object to configure.
     */
    private setupWorkerListeners(poolWorker: PoolWorker): void {
        const { worker } = poolWorker;

        worker.on('message', (message: { jobId: number, result: any, error?: string }) => {
            // Find the task that this result belongs to
            const taskIndex = this.taskQueue.findIndex(t => t.jobId === message.jobId);
            if (taskIndex === -1) return;

            const task = this.taskQueue.splice(taskIndex, 1)[0];
            
            if (message.error) {
                console.error(chalk.magenta.bold(`[PoolWorker ${worker.threadId}]`), chalk.red('Task failed:'), message.error);
                task.reject(new Error(message.error));
            } else {
                console.log(chalk.magenta.bold(`[PoolWorker ${worker.threadId}]`), chalk.green('Task completed successfully'));
                task.resolve(message.result);
            }

            // Mark the worker as available and try to run the next queued task
            poolWorker.isBusy = false;
            this.runNextTask();
        });

        worker.on('error', (err: Error) => {
            console.error(chalk.magenta.bold(`[PoolWorker ${worker.threadId}]`), chalk.red('Uncaught Error:'), err);
            // In a robust system, you might restart the worker here
            this.terminateWorker(poolWorker);
        });

        worker.on('exit', (code: number) => {
            if (code !== 0) {
                console.error(chalk.magenta.bold(`[PoolWorker ${worker.threadId}]`), chalk.red(`Worker exited with code ${code}. Restarting...`));
                // Simple restart logic:
                this.terminateWorker(poolWorker); // Remove the old entry
                this.initializeWorkers(); // Re-initialize (this is simplistic; production code needs better resilience)
            }
        });
    }
    
    /**
     * Terminates a worker and removes it from the pool array.
     * @param poolWorker The worker object to terminate.
     */
    private terminateWorker(poolWorker: PoolWorker): void {
        poolWorker.worker.terminate();
        const index = this.workers.indexOf(poolWorker);
        if (index > -1) {
            this.workers.splice(index, 1);
        }
    }

    /**
     * Finds an idle worker and assigns the next task from the queue to it.
     */
    private runNextTask(): void {
        if (this.taskQueue.length === 0) return; // No tasks left

        const idleWorker = this.workers.find(w => !w.isBusy);
        
        if (idleWorker) {
            const task = this.taskQueue.shift()!;
            idleWorker.isBusy = true;
            
            console.log(
                chalk.magenta.bold('[PoolManager]'), 
                chalk.cyan(`Dispatching Job ${task.jobId} to Worker ${idleWorker.worker.threadId}.`),
                chalk.gray(`Queue length: ${this.taskQueue.length}`)
            );
            
            // Send the job data and ID to the worker
            idleWorker.worker.postMessage({ jobId: task.jobId, data: task.data });
        }
    }

    /**
     * Submits a new task to the worker pool. Returns a Promise that resolves 
     * with the worker's result or rejects with an error.
     * @param data The data to be processed by the worker.
     * @returns A Promise for the task result.
     */
    public runTask(data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const jobId = this.nextJobId++;
            const task: PoolTask = { jobId, data, resolve, reject };
            this.taskQueue.push(task);
            this.runNextTask(); // Attempt to run the task immediately
        });
    }

    /**
     * Shuts down all workers in the pool gracefully.
     */
    public async terminate(): Promise<void> {
        console.log(chalk.magenta.bold('[PoolManager]'), chalk.yellow('Shutting down all workers...'));
        const terminationPromises = this.workers.map(w => w.worker.terminate());
        await Promise.allSettled(terminationPromises);
        this.workers = [];
        console.log(chalk.magenta.bold('[PoolManager]'), chalk.green('Worker Pool successfully terminated.'));
    }
}