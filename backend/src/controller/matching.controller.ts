import { Router } from 'express';
import chalk from 'chalk';
import { ANTHROPIC_API_KEY } from '../config';
import { matchingEngine } from '../services/matching-engine.instance';
import { MatchFilters } from '../types/matchFilters';

const router = Router();

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

        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Received match request with filters:'), filters);

        const result = await matchingEngine.matchMarkets(filters);

        res.json({
            success: true,
            ...result,
            cacheHit: false // Could be enhanced to track this
        });
    } catch (error) {
        console.error(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Error in match endpoint:'), error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
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

        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Finding arbitrage opportunities with min price diff:'), chalk.white(minPriceDiff));

        const opportunities = await matchingEngine.findArbitrageOpportunities(filters, minPriceDiff);

        // Calculate potential profit for each opportunity
        const enrichedOpportunities = opportunities.map(opp => {
            const priceDiff = Math.abs(opp.polymarketRecord.price - opp.kalshiRecord.price);
            const avgVolume = (opp.polymarketRecord.volume + opp.kalshiRecord.volume) / 2;

            return {
                ...opp,
                priceDifference: priceDiff,
                potentialProfitPercentage: (priceDiff / Math.min(opp.polymarketRecord.price, opp.kalshiRecord.price)) * 100,
                averageVolume: avgVolume,
                liquidityScore: Math.min(opp.polymarketRecord.volume, opp.kalshiRecord.volume)
            };
        });

        res.json({
            success: true,
            opportunities: enrichedOpportunities,
            count: enrichedOpportunities.length,
            minPriceDifference: minPriceDiff
        });
    } catch (error) {
        console.error(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Error in arbitrage endpoint:'), error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
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

        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Received GET match request with filters:'), filters);

        const result = await matchingEngine.matchMarkets(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Error in GET match endpoint:'), error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// Clear cache endpoint (useful for testing or forced refresh)
router.post('/cache/clear', async (req, res) => {
    try {
        await matchingEngine.clearCache();
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        console.error(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Error clearing cache:'), error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!ANTHROPIC_API_KEY
    };

    res.json(health);
});

export default router;