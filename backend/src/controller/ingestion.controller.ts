import { Router } from 'express';
import { ingestionManager } from '../services/ingestion-manager';
import { INGESTION_SOURCES, IngestionSource } from '../types/ingestion';

const ingestionRoutes = Router();

const isSource = (s: string): s is IngestionSource => (INGESTION_SOURCES as string[]).includes(s);

// Current state of each venue's ingestor
ingestionRoutes.get('/', (_req, res) => {
    res.json({ success: true, data: ingestionManager.getStatus() });
});

// Turn one venue's ingestion on or off: body { enabled: boolean }
ingestionRoutes.post('/:source', async (req, res) => {
    const { source } = req.params;
    if (!isSource(source)) {
        return res.status(400).json({ success: false, error: `Unknown source '${source}'.` });
    }
    if (typeof req.body?.enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Body must be { enabled: boolean }.' });
    }
    try {
        await ingestionManager.setSource(source, req.body.enabled);
        res.json({ success: true, data: ingestionManager.getStatus() });
    } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});

export default ingestionRoutes;
