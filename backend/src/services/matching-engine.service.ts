import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { PolymarketService } from './polymarket.service';
import { KalshiService } from './kalshi.service';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { MarketMatch } from '../types/marketMatch';
import { MatchFilters } from '../types/matchFilters';
import { MatchingResult } from '../types/matchingResult';
import { TextProcessor } from '../utils/text-processor';
import { MatchCache } from '../utils/match-cache';

export class MatchingEngineService {
    private anthropic: Anthropic;
    private textProcessor: TextProcessor;
    private matchCache: MatchCache;
    private readonly MAX_RECORDS_PER_BATCH = 50; // Prevent token overflow
    private readonly CACHE_TTL_MS = 3600000; // 1 hour cache

    constructor(apiKey: string) {
        this.anthropic = new Anthropic({
            apiKey: apiKey
        });
        this.textProcessor = new TextProcessor();
        this.matchCache = new MatchCache(this.CACHE_TTL_MS);
    }

    /**
     * Fetch records from both databases based on filters
     */
    private fetchRecords(filters: MatchFilters): {
        polymarketRecords: PolymarketDataRecord[];
        kalshiRecords: KalshiDataRecord[];
    } {
        let polymarketRecords: PolymarketDataRecord[];
        let kalshiRecords: KalshiDataRecord[];

        // Fetch Polymarket records
        if (filters.polymarketTicker) {
            polymarketRecords = PolymarketService.getByTicker(filters.polymarketTicker, filters.limit);
        } else if (filters.startTimestamp && filters.endTimestamp) {
            polymarketRecords = PolymarketService.getByTimeRange(filters.startTimestamp, filters.endTimestamp);
        } else {
            polymarketRecords = PolymarketService.getLatestByTicker();
        }

        // Fetch Kalshi records
        if (filters.kalshiTicker) {
            kalshiRecords = KalshiService.getByTicker(filters.kalshiTicker, filters.limit);
        } else if (filters.startTimestamp && filters.endTimestamp) {
            kalshiRecords = KalshiService.getByTimeRange(filters.startTimestamp, filters.endTimestamp);
        } else {
            kalshiRecords = KalshiService.getLatestByTicker();
        }

        // Apply limit if specified and not already applied
        if (filters.limit) {
            polymarketRecords = polymarketRecords.slice(0, filters.limit);
            kalshiRecords = kalshiRecords.slice(0, filters.limit);
        }

        return { polymarketRecords, kalshiRecords };
    }

    /**
     * Pre-filter records using tokenization and similarity heuristics
     * This reduces the number of records sent to Claude
     */
    private preFilterRecords(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[]
    ): {
        polymarketRecords: PolymarketDataRecord[];
        kalshiRecords: KalshiDataRecord[];
        quickMatches: Map<number, number[]>;
    } {
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.cyan('Starting pre-filtering with tokenization...'));

        const quickMatches = new Map<number, number[]>();

        // Process and tokenize all records
        const processedPolymarket = polymarketRecords.map((record, index) => ({
            index,
            record,
            tokens: this.textProcessor.tokenize(record.ticker),
            normalized: this.textProcessor.normalize(record.ticker)
        }));

        const processedKalshi = kalshiRecords.map((record, index) => ({
            index,
            record,
            tokens: this.textProcessor.tokenize(record.ticker),
            normalized: this.textProcessor.normalize(record.ticker)
        }));

        // Find potential matches using token overlap
        const relevantPolymarketIndices = new Set<number>();
        const relevantKalshiIndices = new Set<number>();

        processedPolymarket.forEach((poly) => {
            const potentialMatches: number[] = [];

            processedKalshi.forEach((kalshi) => {
                const similarity = this.textProcessor.calculateTokenSimilarity(
                    poly.tokens,
                    kalshi.tokens
                );

                // If there's any token overlap or high similarity, consider them
                if (similarity > 0.3) {
                    potentialMatches.push(kalshi.index);
                    relevantPolymarketIndices.add(poly.index);
                    relevantKalshiIndices.add(kalshi.index);
                }
            });

            if (potentialMatches.length > 0) {
                quickMatches.set(poly.index, potentialMatches);
            }
        });

        // Filter to only relevant records
        const filteredPolymarket = polymarketRecords.filter((_, i) =>
            relevantPolymarketIndices.has(i)
        );
        const filteredKalshi = kalshiRecords.filter((_, i) =>
            relevantKalshiIndices.has(i)
        );

        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green('Pre-filtering complete:'));
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
     * Use Claude to match markets from both platforms with optimizations
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

        const { polymarketRecords, kalshiRecords } = this.fetchRecords(filters);

        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.yellow(`Fetched ${polymarketRecords.length} Polymarket records and ${kalshiRecords.length} Kalshi records`));

        if (polymarketRecords.length === 0 || kalshiRecords.length === 0) {
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('No records to match'));
            return {
                matches: [],
                totalPolymarketRecords: polymarketRecords.length,
                totalKalshiRecords: kalshiRecords.length,
                matchedCount: 0
            };
        }

        // Pre-filter using tokenization
        const {
            polymarketRecords: filteredPoly,
            kalshiRecords: filteredKalshi,
            quickMatches
        } = this.preFilterRecords(polymarketRecords, kalshiRecords);

        // If pre-filtering eliminated everything, return empty
        if (filteredPoly.length === 0 || filteredKalshi.length === 0) {
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Pre-filtering eliminated all potential matches'));
            return {
                matches: [],
                totalPolymarketRecords: polymarketRecords.length,
                totalKalshiRecords: kalshiRecords.length,
                matchedCount: 0
            };
        }

        // Process in batches if needed
        const matches: MarketMatch[] = [];
        const polyBatches = this.createBatches(filteredPoly, this.MAX_RECORDS_PER_BATCH);

        for (let i = 0; i < polyBatches.length; i++) {
            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.magenta(`Processing batch ${i + 1}/${polyBatches.length}`));
            const batchMatches = await this.processMatchingBatch(
                polyBatches[i],
                filteredKalshi,
                quickMatches,
                polymarketRecords,
                kalshiRecords
            );
            matches.push(...batchMatches);
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
     * Process a batch of records through Claude
     */
    private async processMatchingBatch(
        polymarketBatch: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches: Map<number, number[]>,
        originalPolyRecords: PolymarketDataRecord[],
        originalKalshiRecords: KalshiDataRecord[]
    ): Promise<MarketMatch[]> {
        const prompt = this.buildOptimizedPrompt(polymarketBatch, kalshiRecords, quickMatches);

        try {
            const message = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
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
     * Build an optimized prompt with tokenized data and hints
     */
    private buildOptimizedPrompt(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches: Map<number, number[]>
    ): string {
        // Include tokenized versions for better matching
        const polymarketData = polymarketRecords.map((r, i) => {
            const tokens = this.textProcessor.tokenize(r.ticker);
            const normalized = this.textProcessor.normalize(r.ticker);
            return `${i}. Ticker: ${r.ticker}
   Normalized: ${normalized}
   Key Terms: ${tokens.join(', ')}
   Price: $${r.price}, Volume: ${r.volume}
   Timestamp: ${r.timestamp}`;
        }).join('\n\n');

        const kalshiData = kalshiRecords.map((r, i) => {
            const tokens = this.textProcessor.tokenize(r.ticker);
            const normalized = this.textProcessor.normalize(r.ticker);
            return `${i}. Ticker: ${r.ticker}
   Normalized: ${normalized}
   Key Terms: ${tokens.join(', ')}
   Price: $${r.price}, Volume: ${r.volume}
   Timestamp: ${r.timestamp}`;
        }).join('\n\n');

        // Add hints about pre-filtered matches
        let hints = '';
        if (quickMatches.size > 0) {
            hints = '\n\nPre-filtered potential matches (high token similarity):';
            quickMatches.forEach((kalshiIndices, polyIndex) => {
                hints += `\n- Polymarket ${polyIndex} may match Kalshi: ${kalshiIndices.join(', ')}`;
            });
        }

        return `You are a market matching engine. Your task is to find similar or identical prediction markets between Polymarket and Kalshi platforms.

Each market includes its normalized form and key terms extracted via tokenization to help with matching.

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
      "reasoning": "Brief explanation of why these markets match"
    }
  ]
}

Matching criteria:
- "exact": Same event, same outcome (confidence >= 0.9)
- "high": Same event, slightly different outcome or time frame (confidence >= 0.75)
- "medium": Related events, similar outcomes (confidence >= 0.6)
- "low": Loosely related events (confidence >= 0.5)

Consider:
1. The normalized ticker text and key terms provided
2. Similar events even with different wording
3. Time frames and outcomes
4. Pre-filtered hints (these are algorithmically suggested matches)

Only include matches with confidence >= 0.6. Return valid JSON only, no markdown formatting.`;
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
            // Remove markdown code blocks if present
            const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(jsonText);

            if (!parsed.matches || !Array.isArray(parsed.matches)) {
                console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Invalid response format from Claude'));
                return [];
            }

            const matches: MarketMatch[] = parsed.matches
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
                .map((m: any) => ({
                    polymarketRecord: polymarketRecords[m.polymarketIndex],
                    kalshiRecord: kalshiRecords[m.kalshiIndex],
                    similarity: m.similarity || 'low',
                    confidence: m.confidence,
                    reasoning: m.reasoning || 'No reasoning provided'
                }));

            console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.green(`Parsed ${matches.length} valid matches`));
            return matches;
        } catch (error) {
            console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Error parsing Claude response:'), error);
            console.error(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.red('Response text:'), responseText);
            return [];
        }
    }

    /**
     * Create batches of records to prevent token overflow
     */
    private createBatches<T>(records: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < records.length; i += batchSize) {
            batches.push(records.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Remove duplicate matches (same market pair matched multiple times)
     */
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

    /**
     * Get arbitrage opportunities (markets with significant price differences)
     */
    async findArbitrageOpportunities(
        filters: MatchFilters = {},
        minPriceDifference: number = 0.05
    ): Promise<MarketMatch[]> {
        const result = await this.matchMarkets(filters);

        const arbitrageOpportunities = result.matches.filter(match => {
            const priceDiff = Math.abs(match.polymarketRecord.price - match.kalshiRecord.price);
            return priceDiff >= minPriceDifference;
        });

        // Sort by price difference (highest first)
        return arbitrageOpportunities.sort((a, b) => {
            const diffA = Math.abs(a.polymarketRecord.price - a.kalshiRecord.price);
            const diffB = Math.abs(b.polymarketRecord.price - b.kalshiRecord.price);
            return diffB - diffA;
        });
    }

    /**
     * Clear the match cache
     */
    clearCache(): void {
        this.matchCache.clear();
        console.log(chalk.blue.bold('[MATCHING-ENGINE]'), chalk.yellow('Cache cleared'));
    }
}