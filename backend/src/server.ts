// src/server.ts
import express from 'express';
import { PORT } from './config';
import { SQLiteClient } from '../src/database/sqlite.client';
import { startIngestorWorker } from '../src/workers/data-ingestor';
import polymarketRoutes from './controller/polymarket.controller';
import kalshiRoutes from './controller/kalshi.controller';
import matchingRoutes from './controller/matching.controller';

async function startServer() {
    SQLiteClient.initialize();
    // start worker process for getting data
    //startIngestorWorker();

    const app = express();
    app.use(express.json());

    // register routes
    app.use('/api/polymarket', polymarketRoutes);
    app.use('/api/kalshi', kalshiRoutes);
    app.use('/api/matching', matchingRoutes);

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();