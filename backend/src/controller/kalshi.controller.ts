import { Router } from 'express';
import { KalshiService } from '../services/kalshi.service';

const kalshiRouter = Router();

// Get all Kalshi records
kalshiRouter.get('/', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const data = KalshiService.getAll(limit, offset);
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get total count
kalshiRouter.get('/count', (req, res) => {
    try {
        const count = KalshiService.getCount();
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get latest for each ticker
kalshiRouter.get('/latest/all', (req, res) => {
    try {
        const data = KalshiService.getLatestByTicker();
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get by time range
kalshiRouter.get('/timerange', (req, res) => {
    try {
        const start = parseInt(req.query.start as string);
        const end = parseInt(req.query.end as string);
        if (isNaN(start) || isNaN(end)) {
            return res.status(400).json({ success: false, error: 'Invalid start or end timestamp' });
        }
        const data = KalshiService.getByTimeRange(start, end);
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get by ticker
kalshiRouter.get('/ticker/:ticker', (req, res) => {
    try {
        const ticker = req.params.ticker;
        const limit = parseInt(req.query.limit as string) || 100;
        const data = KalshiService.getByTicker(ticker, limit);
        res.json({ success: true, data, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Get by ID
kalshiRouter.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = KalshiService.getById(id);
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