import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { PolymarketService } from './polymarket.service';
import { KalshiService } from './kalshi.service';
import { ConsensusService } from './consensus.service';
import { VectorMatchingService } from './vector-matching.service'; // New Service
import { PolymarketDataRecord } from '../types/polymarketDataRecord';
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { MarketMatch } from '../types/marketMatch';
import { MatchFilters } from '../types/matchFilters';
import { MatchingResult } from '../types/matchingResult';
import { TextProcessor } from '../utils/text-processor';
import { MatchCache } from '../utils/match-cache';

export class MatchingEngineService {
    private anthropic: Anthropic;
    private consensusService?: ConsensusService;
    private textProcessor: TextProcessor;
    private matchCache: MatchCache;
    
    private readonly MAX_RECORDS_PER_BATCH = 50;
    private readonly VECTOR_SIMILARITY_THRESHOLD = 0.75;
    private readonly CACHE_TTL_MS = 3600000;
    private useConsensus: boolean;

    constructor(
        anthropicKey: string,
        geminiKey?: string,
        openaiKey?: string,
        useConsensus: boolean = true
    ) {
        this.anthropic = new Anthropic({
            apiKey: anthropicKey
        });
        
        // Initialize consensus service if keys are provided
        if (geminiKey && openaiKey && useConsensus) {
            this.consensusService = new ConsensusService(anthropicKey, geminiKey, openaiKey);
            this.useConsensus = true;
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green('Consensus mode enabled with multi-agent matching'));
        } else {
            this.useConsensus = false;
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.yellow('Single-agent mode (Claude only)'));
        }
        
        this.textProcessor = new TextProcessor();
        this.matchCache = new MatchCache(this.CACHE_TTL_MS);

        // Warm the embedding model in the background so the first match request
        // does not pay the download cost. getInstance() memoises the load, so
        // the pre-filter simply awaits the same promise later; a failure here is
        // not fatal because getInstance() retries on the next request.
        VectorMatchingService.getInstance()
            .then(() => console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green('Vector Matching Service ready.')))
            .catch(err => console.error(
                chalk.blue.bold('[MATCHING-ENGINE]'),
                chalk.yellow('Vector model not preloaded (will retry on first match):'),
                err instanceof Error ? err.message : err
            ));
    }

    /**
     * Fetch records from both databases based on filters
     */
    private async fetchRecords(filters: MatchFilters): Promise<{
        polymarketRecords: PolymarketDataRecord[];
        kalshiRecords: KalshiDataRecord[];
    }> {
        // Both sides are independent queries, so issue them concurrently.
        let [polymarketRecords, kalshiRecords] = await Promise.all([
            filters.polymarketTicker
                ? PolymarketService.getByTicker(filters.polymarketTicker, filters.limit)
                : filters.startTimestamp && filters.endTimestamp
                    ? PolymarketService.getByTimeRange(filters.startTimestamp, filters.endTimestamp)
                    : PolymarketService.getLatestByTicker(),
            filters.kalshiTicker
                ? KalshiService.getByTicker(filters.kalshiTicker, filters.limit)
                : filters.startTimestamp && filters.endTimestamp
                    ? KalshiService.getByTimeRange(filters.startTimestamp, filters.endTimestamp)
                    : KalshiService.getLatestByTicker()
        ]);

        // Apply limit if specified
        if (filters.limit) {
            polymarketRecords = polymarketRecords.slice(0, filters.limit);
            kalshiRecords = kalshiRecords.slice(0, filters.limit);
        }

        return { polymarketRecords, kalshiRecords };
    }

    /**
     * Pre-filter records using Semantic Vector Embeddings.
     *
     * Returns the surviving records plus `quickMatches`, a map of
     * FILTERED-array indices (poly -> kalshi). The indices are deliberately in
     * the filtered index space because that is the space the LLM prompts
     * enumerate; emitting original-array indices here would make every hint
     * point at the wrong market.
     */
    private async preFilterRecords(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[]
    ): Promise<{
        polymarketRecords: PolymarketDataRecord[];
        kalshiRecords: KalshiDataRecord[];
        quickMatches: Map<number, number[]>;
    }> {
        const vectorService = await VectorMatchingService.getInstance();

        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.cyan('Starting semantic pre-filtering...'));

        // Use the title where we have one, otherwise fall back to the ticker,
        // since the ticker still carries some semantic signal.
        const polyTexts = polymarketRecords.map(r => r.title || r.ticker);
        const kalshiTexts = kalshiRecords.map(r => r.title || r.ticker);

        // Embed both sides once up front, then compare in memory.
        const [polyEmbeddings, kalshiEmbeddings] = await Promise.all([
            vectorService.getEmbeddings(polyTexts),
            vectorService.getEmbeddings(kalshiTexts)
        ]);

        // Original-index pairs that clear the similarity threshold.
        const rawMatches = new Map<number, number[]>();
        const relevantPolymarketIndices = new Set<number>();
        const relevantKalshiIndices = new Set<number>();

        for (let i = 0; i < polyEmbeddings.length; i++) {
            const hits: number[] = [];

            for (let j = 0; j < kalshiEmbeddings.length; j++) {
                const score = vectorService.calculateSimilarity(polyEmbeddings[i], kalshiEmbeddings[j]);
                if (score >= this.VECTOR_SIMILARITY_THRESHOLD) {
                    hits.push(j);
                }
            }

            if (hits.length > 0) {
                rawMatches.set(i, hits);
                relevantPolymarketIndices.add(i);
                hits.forEach(j => relevantKalshiIndices.add(j));
            }
        }

        // Filter to only relevant records, remembering where each one moved to.
        const filteredPolymarket: PolymarketDataRecord[] = [];
        const polyIndexRemap = new Map<number, number>();
        polymarketRecords.forEach((record, i) => {
            if (relevantPolymarketIndices.has(i)) {
                polyIndexRemap.set(i, filteredPolymarket.length);
                filteredPolymarket.push(record);
            }
        });

        const filteredKalshi: KalshiDataRecord[] = [];
        const kalshiIndexRemap = new Map<number, number>();
        kalshiRecords.forEach((record, j) => {
            if (relevantKalshiIndices.has(j)) {
                kalshiIndexRemap.set(j, filteredKalshi.length);
                filteredKalshi.push(record);
            }
        });

        // Translate the hint map into the filtered index space.
        const quickMatches = new Map<number, number[]>();
        rawMatches.forEach((kalshiIndices, polyIndex) => {
            quickMatches.set(
                polyIndexRemap.get(polyIndex)!,
                kalshiIndices.map(j => kalshiIndexRemap.get(j)!)
            );
        });

        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green('Semantic filtering complete:'));
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.gray(`  - Polymarket: ${polymarketRecords.length} → ${filteredPolymarket.length} records`));
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.gray(`  - Kalshi: ${kalshiRecords.length} → ${filteredKalshi.length} records`));
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.gray(`  - Potential match pairs: ${quickMatches.size}`));

        return {
            polymarketRecords: filteredPolymarket,
            kalshiRecords: filteredKalshi,
            quickMatches
        };
    }

    /**
     * Narrow the hint map to a single batch, rebasing the Polymarket indices so
     * they line up with the positions the prompt will actually enumerate.
     */
    private sliceQuickMatchesForBatch(
        quickMatches: Map<number, number[]>,
        batchOffset: number,
        batchSize: number
    ): Map<number, number[]> {
        const sliced = new Map<number, number[]>();
        quickMatches.forEach((kalshiIndices, polyIndex) => {
            if (polyIndex >= batchOffset && polyIndex < batchOffset + batchSize) {
                sliced.set(polyIndex - batchOffset, kalshiIndices);
            }
        });
        return sliced;
    }

    /**
     * Main entry point to match markets
     */
    async matchMarkets(filters: MatchFilters = {}): Promise<MatchingResult> {
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.cyan('Starting market matching with filters:'), filters);

        // Check cache first
        const cacheKey = this.matchCache.generateKey(filters);
        const cachedResult = this.matchCache.get(cacheKey);
        if (cachedResult) {
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green('Returning cached result'));
            return cachedResult;
        }

        const { polymarketRecords, kalshiRecords } = await this.fetchRecords(filters);

        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.yellow(`Fetched ${polymarketRecords.length} Polymarket records and ${kalshiRecords.length} Kalshi records`));

        if (polymarketRecords.length === 0 || kalshiRecords.length === 0) {
            return {
                matches: [],
                totalPolymarketRecords: polymarketRecords.length,
                totalKalshiRecords: kalshiRecords.length,
                matchedCount: 0
            };
        }

        // Pre-filter using Semantic Vectors (Async)
        const {
            polymarketRecords: filteredPoly,
            kalshiRecords: filteredKalshi,
            quickMatches
        } = await this.preFilterRecords(polymarketRecords, kalshiRecords);

        if (filteredPoly.length === 0 || filteredKalshi.length === 0) {
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Pre-filtering eliminated all potential matches'));
            return {
                matches: [],
                totalPolymarketRecords: polymarketRecords.length,
                totalKalshiRecords: kalshiRecords.length,
                matchedCount: 0
            };
        }

        // Process in batches to respect LLM token limits
        const matches: MarketMatch[] = [];
        const polyBatches = this.createBatches(filteredPoly, this.MAX_RECORDS_PER_BATCH);

        let batchOffset = 0;

        for (let i = 0; i < polyBatches.length; i++) {
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.magenta(`Processing batch ${i + 1}/${polyBatches.length}`));

            const batch = polyBatches[i];
            const batchMatches = await this.processMatchingBatch(
                batch,
                filteredKalshi,
                this.sliceQuickMatchesForBatch(quickMatches, batchOffset, batch.length)
            );
            matches.push(...batchMatches);
            batchOffset += batch.length;
        }

        // Remove duplicates and sort by confidence
        const uniqueMatches = this.deduplicateMatches(matches);
        const sortedMatches = uniqueMatches.sort((a, b) => b.confidence - a.confidence);

        const result: MatchingResult = {
            matches: sortedMatches,
            totalPolymarketRecords: polymarketRecords.length,
            totalKalshiRecords: kalshiRecords.length,
            matchedCount: sortedMatches.length
        };

        // Cache the result
        this.matchCache.set(cacheKey, result);

        return result;
    }

    /**
     * Process a batch using either single agent or consensus
     */
    private async processMatchingBatch(
        polymarketBatch: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches: Map<number, number[]>
    ): Promise<MarketMatch[]> {
        if (this.useConsensus) {
            return this.processWithConsensus(polymarketBatch, kalshiRecords, quickMatches);
        } else {
            return this.processWithClaude(polymarketBatch, kalshiRecords, quickMatches);
        }
    }

    /**
     * Process with consensus service (multi-agent)
     */
    private async processWithConsensus(
        polymarketBatch: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches: Map<number, number[]>
    ): Promise<MarketMatch[]> {
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.magenta('Using consensus matching...'));

        if (!this.consensusService) {
            console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Consensus service not initialized, falling back to Claude'));
            return this.processWithClaude(polymarketBatch, kalshiRecords, quickMatches);
        }

        try {
            const consensusMatches = await this.consensusService.getConsensusMatches(
                polymarketBatch,
                kalshiRecords,
                quickMatches
            );

            // Convert consensus matches to MarketMatch format
            return consensusMatches.map(cm => ({
                polymarketRecord: polymarketBatch[cm.polymarketIndex],
                kalshiRecord: kalshiRecords[cm.kalshiIndex],
                similarity: cm.similarity as 'exact' | 'high' | 'medium' | 'low',
                confidence: cm.averageConfidence,
                reasoning: `${cm.reasoning} (Consensus: ${(cm.consensusScore * 100).toFixed(0)}% - Voted by: ${cm.agentVotes.join(', ')})`
            }));
        } catch (error) {
            console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Consensus matching failed, falling back to Claude:'), error);
            return this.processWithClaude(polymarketBatch, kalshiRecords, quickMatches);
        }
    }

    /**
     * Process with Claude only (single agent)
     */
    private async processWithClaude(
        polymarketBatch: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches: Map<number, number[]>
    ): Promise<MarketMatch[]> {
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.blue('Using single-agent (Claude) matching...'));

        const prompt = this.buildOptimizedPrompt(polymarketBatch, kalshiRecords, quickMatches);

        try {
            const message = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514', // Ensure this model ID is current
                max_tokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green('Received response from Claude'));

            return this.parseClaudeResponse(responseText, polymarketBatch, kalshiRecords);
        } catch (error) {
            console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Error calling Claude API:'), error);
            throw error;
        }
    }

    /**
     * Build an optimized prompt using TextProcessor for normalization
     * and hinting at vector matches.
     */
    private buildOptimizedPrompt(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches: Map<number, number[]>
    ): string {
        // Titles carry far more signal than tickers, so send both when available.
        const polymarketData = polymarketRecords.map((r, i) => {
            const title = r.title || r.ticker;
            return `${i}. Title: ${title}
   Ticker: ${r.ticker}
   Normalized: ${this.textProcessor.normalize(title)}
   Outcome: ${r.outcome || 'n/a'}
   Price: $${r.price}, Volume: ${r.volume}
   Timestamp: ${r.timestamp}`;
        }).join('\n\n');

        const kalshiData = kalshiRecords.map((r, i) => {
            const title = r.title || r.ticker;
            return `${i}. Title: ${title}
   Ticker: ${r.ticker}
   Normalized: ${this.textProcessor.normalize(title)}
   Subtitle: ${r.subtitle || 'n/a'}
   Price: $${r.price}, Volume: ${r.volume}
   Timestamp: ${r.timestamp}`;
        }).join('\n\n');

        let hints = '';
        if (quickMatches.size > 0) {
            hints = '\n\nHigh Probability Matches (Semantically Linked):';
            quickMatches.forEach((kalshiIndices, polyIndex) => {
                hints += `\n- Polymarket Item ${polyIndex} is semantically similar to Kalshi Items: ${kalshiIndices.join(', ')}`;
            });
        }

        return `You are a market matching engine. Your task is to find similar or identical prediction markets between Polymarket and Kalshi.

Polymarket Markets:
${polymarketData}

Kalshi Markets:
${kalshiData}
${hints}

Please analyze these markets and return matching pairs in the following JSON format:
{
  "matches": [
    {
      "polymarketIndex": 0,
      "kalshiIndex": 0,
      "similarity": "exact|high|medium|low",
      "confidence": 0.95,
      "reasoning": "Brief explanation"
    }
  ]
}

Matching criteria:
- "exact": Same event, same outcome.
- "high": Same event, slightly different phrasing.
- "medium": Related events.
- "low": Loosely related.

Only include matches with confidence >= 0.6. Return valid JSON only.`;
    }

    /**
     * Parse Claude's response and build match objects
     */
    private parseClaudeResponse(
        responseText: string,
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[]
    ): MarketMatch[] {
        try {
            const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(jsonText);

            if (!parsed.matches || !Array.isArray(parsed.matches)) {
                return [];
            }

            const validSimilarities = ['exact', 'high', 'medium', 'low'] as const;

            return parsed.matches
                .filter((m: any) => {
                    return (
                        typeof m.polymarketIndex === 'number' &&
                        typeof m.kalshiIndex === 'number' &&
                        m.polymarketIndex >= 0 &&
                        m.polymarketIndex < polymarketRecords.length &&
                        m.kalshiIndex >= 0 &&
                        m.kalshiIndex < kalshiRecords.length &&
                        m.confidence >= 0.6
                    );
                })
                .map((m: any) => {
                    const similarity = validSimilarities.includes(m.similarity) ? m.similarity : 'low';
                    return {
                        polymarketRecord: polymarketRecords[m.polymarketIndex],
                        kalshiRecord: kalshiRecords[m.kalshiIndex],
                        similarity: similarity,
                        confidence: m.confidence,
                        reasoning: m.reasoning || 'No reasoning provided'
                    };
                });
        } catch (error) {
            console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Error parsing response'), error);
            return [];
        }
    }

    private createBatches<T>(records: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < records.length; i += batchSize) {
            batches.push(records.slice(i, i + batchSize));
        }
        return batches;
    }

    private deduplicateMatches(matches: MarketMatch[]): MarketMatch[] {
        const seen = new Set<string>();
        const unique: MarketMatch[] = [];
        for (const match of matches) {
            const key = `${match.polymarketRecord.ticker}:${match.kalshiRecord.ticker}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(match);
            }
        }
        return unique;
    }

    async findArbitrageOpportunities(
        filters: MatchFilters = {},
        minPriceDifference: number = 0.05
    ): Promise<MarketMatch[]> {
        const result = await this.matchMarkets(filters);
        return result.matches
            .filter(match => Math.abs(match.polymarketRecord.price - match.kalshiRecord.price) >= minPriceDifference)
            .sort((a, b) => {
                const diffA = Math.abs(a.polymarketRecord.price - a.kalshiRecord.price);
                const diffB = Math.abs(b.polymarketRecord.price - b.kalshiRecord.price);
                return diffB - diffA;
            });
    }

    async clearCache(): Promise<void> {
        this.matchCache.clear();
        // Only clear the embedding cache if the model actually loaded.
        await VectorMatchingService.getInstance()
            .then(service => service.clearCache())
            .catch(() => undefined);
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.yellow('Cache cleared'));
    }
}