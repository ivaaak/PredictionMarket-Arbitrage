import { Router } from 'express';
import { StatsService } from '../services/stats.service';
import { INGESTION_SOURCES, IngestionSource } from '../types/ingestion';

const statsRoutes = Router();

// Aggregates for the analytics dashboard
statsRoutes.get('/overview', async (_req, res) => {
    try {
        const data = await StatsService.overview();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});

// Market picker: /api/stats/search?source=polymarket&q=fed
statsRoutes.get('/search', async (req, res) => {
    const source = String(req.query.source ?? '');
    const q = String(req.query.q ?? '').trim();
    if (!(INGESTION_SOURCES as string[]).includes(source)) {
        return res.status(400).json({ success: false, error: `Unknown source '${source}'.` });
    }
    try {
        const data = q.length < 2 ? [] : await StatsService.searchMarkets(source as IngestionSource, q);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});

export default statsRoutes;
