import express from 'express';
import chalk from 'chalk';
import { PORT, ENABLE_INGESTOR } from './config';
import { PostgresClient } from './database/postgres.client';
import { closePool } from './database/pool';
import polymarketRoutes from './controller/polymarket.controller';
import kalshiRoutes from './controller/kalshi.controller';
import matchingRoutes from './controller/matching.controller';
import resultRoutes from './controller/results.controller';
import ingestionRoutes from './controller/ingestion.controller';
import statsRoutes from './controller/stats.controller';
import { ingestionManager } from './services/ingestion-manager';

async function startServer() {
    // Create the tables before anything serves traffic. The ingestor worker also
    // calls this, but the API must not depend on the worker being enabled.
    await PostgresClient.initialize();

    // Either way, each venue's ingestion can be toggled at runtime via /api/ingestion.
    if (ENABLE_INGESTOR) {
        ingestionManager.start(['polymarket', 'kalshi']).catch(() => undefined);
    } else {
        console.log(chalk.blue.bold('[MAIN]'), chalk.yellow('Ingestor not auto-started (ENABLE_INGESTOR=false). Enable it from the UI or POST /api/ingestion/:source.'));
    }

    const app = express();
    app.use(express.json());

    // Register standard API routes
    app.use('/api/polymarket', polymarketRoutes);
    app.use('/api/kalshi', kalshiRoutes);
    app.use('/api/matching', matchingRoutes);
    app.use('/api/results', resultRoutes);
    app.use('/api/ingestion', ingestionRoutes);
    app.use('/api/stats', statsRoutes);

    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'healthy',
            ingestion: ingestionManager.getStatus(),
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
        ingestionManager.shutdown();

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
