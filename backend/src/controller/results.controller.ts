import { Router } from 'express';
import chalk from 'chalk';
import { MatchingEngineService } from '../services/matching-engine.service';
import { MatchFilters } from '../types/matchFilters';
import { MatchedEventsModel, MatchedEvent } from '../services/match-result.service';

const resultRoutes = Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_API_KEY) {
    console.warn(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Warning: ANTHROPIC_API_KEY not set'));
}

const matchingEngine = new MatchingEngineService(ANTHROPIC_API_KEY);

// 1. Get all matched events (Updated for the new model)
resultRoutes.get('/matched-events', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
        const activeOnly = req.query.activeOnly === 'true';

        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Fetching matched events:'), { limit, offset, activeOnly });

        // The model now sorts by price_spread if activeOnly is true
        const events = activeOnly 
            ? await MatchedEventsModel.getActive(limit)
            : await MatchedEventsModel.getAll(limit, offset);

        res.json({ success: true, count: events.length, data: events });
    } catch (error) {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
});

// 2. Create new matched event (Updated for Snapshot Data)
resultRoutes.post('/matched-events', async (req, res) => {
    try {
        const { 
            polymarket_id, kalshi_id, common_title, 
            poly_ticker, poly_price, poly_volume,
            kalshi_ticker, kalshi_price, kalshi_volume,
            match_confidence, match_category, is_active 
        } = req.body;

        // Validation for the extended model requirements
        if (!polymarket_id || !kalshi_id || !common_title || !poly_ticker || !kalshi_ticker) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: ids, common_title, and tickers are mandatory.'
            });
        }

        const event = await MatchedEventsModel.create({
            polymarket_id,
            kalshi_id,
            common_title,
            poly_ticker,
            poly_price: poly_price ?? 0,
            poly_volume: poly_volume ?? 0,
            kalshi_ticker,
            kalshi_price: kalshi_price ?? 0,
            kalshi_volume: kalshi_volume ?? 0,
            match_confidence: match_confidence ?? 0,
            match_category: match_category || 'Uncategorized',
            is_active: is_active ?? true
        });

        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.green('Created Match:'), `[${event.id}] ${common_title}`);
        res.status(201).json({ success: true, data: event });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});


resultRoutes.get('/matched-events/by-tickers', async (req, res) => {
    const { polymarketTicker, kalshiTicker } = req.query;
    const event = await MatchedEventsModel.getByTickers(polymarketTicker as string, kalshiTicker as string);
    res.json({ success: true, data: event });
});

resultRoutes.delete('/matched-events/:id', async (req, res) => {
    const deleted = await MatchedEventsModel.delete(parseInt(req.params.id));
    res.json({ success: true, deleted });
});

resultRoutes.get('/health', (req, res) => {
    res.json({ status: 'healthy', apiKeyConfigured: !!ANTHROPIC_API_KEY });
});

export default resultRoutes;