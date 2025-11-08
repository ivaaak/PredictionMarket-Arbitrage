import { Router } from 'express';
import { MatchingEngineService } from '../services/matching-engine.service';
import { MatchFilters } from '../types/matchFilters';

const router = Router();

// Get Anthropic API key from environment variable
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

if (!ANTHROPIC_API_KEY) {
    console.warn('[MATCHING-ROUTES] Warning: ANTHROPIC_API_KEY not set in environment variables');
}

const matchingEngine = new MatchingEngineService(ANTHROPIC_API_KEY);

// Match markets with optional filters
router.post('/match', async (req, res) => {
    try {
        const filters: MatchFilters = {
            startTimestamp: req.body.startTimestamp,
            endTimestamp: req.body.endTimestamp,
            polymarketTicker: req.body.polymarketTicker,
            kalshiTicker: req.body.kalshiTicker,
            limit: req.body.limit
        };

        const result = await matchingEngine.matchMarkets(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Find arbitrage opportunities
router.post('/arbitrage', async (req, res) => {
    try {
        const filters: MatchFilters = {
            startTimestamp: req.body.startTimestamp,
            endTimestamp: req.body.endTimestamp,
            polymarketTicker: req.body.polymarketTicker,
            kalshiTicker: req.body.kalshiTicker,
            limit: req.body.limit
        };

        const minPriceDiff = req.body.minPriceDifference || 0.05;
        const opportunities = await matchingEngine.findArbitrageOpportunities(filters, minPriceDiff);
        
        res.json({ 
            success: true, 
            opportunities,
            count: opportunities.length 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Match markets with GET (using query params)
router.get('/match', async (req, res) => {
    try {
        const filters: MatchFilters = {
            startTimestamp: req.query.startTimestamp ? parseInt(req.query.startTimestamp as string) : undefined,
            endTimestamp: req.query.endTimestamp ? parseInt(req.query.endTimestamp as string) : undefined,
            polymarketTicker: req.query.polymarketTicker as string,
            kalshiTicker: req.query.kalshiTicker as string,
            limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
        };

        const result = await matchingEngine.matchMarkets(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

export default router;