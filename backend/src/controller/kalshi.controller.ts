import { Router } from 'express';
import { KalshiService } from '../services/kalshi.service';
import { listMarkets, parseMarketListQuery } from '../services/market-list';
import { KalshiDataRecord } from '../types/kalshiDataRecord';

const kalshiRouter = Router();

// List markets, with optional search, filters and sort (see services/market-list.ts)
kalshiRouter.get('/', async (req, res) => {
    try {
        const { rows, total } = await listMarkets<KalshiDataRecord>('kalshi_data', parseMarketListQuery(req.query));
        res.json({ success: true, data: rows, count: rows.length, total });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get total count
kalshiRouter.get('/count', async (req, res) => {
    try {
        const count = await KalshiService.getCount();
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get latest for each ticker
kalshiRouter.get('/latest/all', async (req, res) => {
    try {
        const data = await KalshiService.getLatestByTicker();
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get by time range
kalshiRouter.get('/timerange', async (req, res) => {
    try {
        const start = parseInt(req.query.start as string);
        const end = parseInt(req.query.end as string);
        if (isNaN(start) || isNaN(end)) {
            return res.status(400).json({ success: false, error: 'Invalid start or end timestamp' });
        }
        const data = await KalshiService.getByTimeRange(start, end);
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get by ticker
kalshiRouter.get('/ticker/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker;
        const limit = parseInt(req.query.limit as string) || 100;
        const data = await KalshiService.getByTicker(ticker, limit);
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get by ID
kalshiRouter.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = await KalshiService.getById(id);
        if (data) {
            res.json({ success: true, data });
        } else {
            res.status(404).json({ success: false, error: 'Record not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

export default kalshiRouter;