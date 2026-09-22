import { Router } from 'express';
import chalk from 'chalk';
import { ANTHROPIC_API_KEY } from '../config';
import { matchingEngine } from '../services/matching-engine.instance';
import { MatchFilters } from '../types/matchFilters';
import { TraceEvent } from '../types/matching-trace';

const router = Router();

// Accepts either a JSON body or query params, so every value may arrive as a string.
function filtersFrom(source: Record<string, unknown>): MatchFilters {
    const int = (v: unknown) => (v === undefined || v === '' ? undefined : parseInt(String(v), 10) || undefined);
    const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
    return {
        startTimestamp: int(source.startTimestamp),
        endTimestamp: int(source.endTimestamp),
        polymarketTicker: str(source.polymarketTicker),
        kalshiTicker: str(source.kalshiTicker),
        search: str(source.search),
        limit: int(source.limit)
    };
}

// Match markets with optional filters
router.post('/match', async (req, res) => {
    try {
        const filters = filtersFrom(req.body);
        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Received match request with filters:'), filters);

        const result = await matchingEngine.matchMarkets(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Error in match endpoint:'), error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// Same as POST /match, but streams the run as newline-delimited JSON: one
// trace event per line while it works (stages, LLM batches, agent votes),
// then a final { type: 'result' } or { type: 'error' } line.
router.post('/match/stream', async (req, res) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const started = Date.now();
    let closed = false;
    res.on('close', () => { closed = true; });
    const send = (line: object) => {
        if (!closed) res.write(JSON.stringify({ ...line, t: Date.now() - started }) + '\n');
    };

    try {
        const filters = filtersFrom(req.body);
        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Received streamed match request with filters:'), filters);
        const result = await matchingEngine.matchMarkets(filters, (event: TraceEvent) => send(event));
        send({ type: 'result', success: true, ...result });
    } catch (error) {
        console.error(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.red('Error in streamed match endpoint:'), error);
        send({ type: 'error', success: false, error: error instanceof Error ? error.message : String(error) });
    }
    res.end();
});

// Find arbitrage opportunities.
// `minNetEdge` is the minimum profit, in dollars per $1 contract pair after
// fees, of buying YES on one venue and the equivalent NO on the other.
router.post('/arbitrage', async (req, res) => {
    try {
        const filters = filtersFrom(req.body);
        const minNetEdge = Number(req.body.minNetEdge ?? 0);

        console.log(chalk.yellow.bold('[MATCHING-ROUTES]'), chalk.cyan('Finding arbitrage opportunities with min net edge:'), chalk.white(minNetEdge));

        const opportunities = await matchingEngine.findArbitrageOpportunities(filters, minNetEdge);

        res.json({
            success: true,
            opportunities,
            count: opportunities.length,
            minNetEdge
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
        const filters = filtersFrom(req.query);
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