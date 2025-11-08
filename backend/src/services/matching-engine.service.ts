import Anthropic from '@anthropic-ai/sdk';
import { PolymarketService } from './polymarket.service';
import { KalshiService } from './kalshi.service';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { MarketMatch } from '../types/marketMatch';
import { MatchFilters } from '../types/matchFilters';
import { MatchingResult } from '../types/matchingResult';

export class MatchingEngineService {
    private anthropic: Anthropic;

    constructor(apiKey: string) {
        this.anthropic = new Anthropic({
            apiKey: apiKey
        });
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
     * Use Claude to match markets from both platforms
     */
    async matchMarkets(filters: MatchFilters = {}): Promise<MatchingResult> {
        console.log('[MATCHING-ENGINE] Starting market matching with filters:', filters);

        const { polymarketRecords, kalshiRecords } = this.fetchRecords(filters);

        console.log(`[MATCHING-ENGINE] Fetched ${polymarketRecords.length} Polymarket records and ${kalshiRecords.length} Kalshi records`);

        if (polymarketRecords.length === 0 || kalshiRecords.length === 0) {
            console.log('[MATCHING-ENGINE] No records to match');
            return {
                matches: [],
                totalPolymarketRecords: polymarketRecords.length,
                totalKalshiRecords: kalshiRecords.length,
                matchedCount: 0
            };
        }

        // Prepare data for Claude
        const prompt = this.buildMatchingPrompt(polymarketRecords, kalshiRecords);

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
            console.log('[MATCHING-ENGINE] Received response from Claude');

            const matches = this.parseClaudeResponse(responseText, polymarketRecords, kalshiRecords);

            return {
                matches,
                totalPolymarketRecords: polymarketRecords.length,
                totalKalshiRecords: kalshiRecords.length,
                matchedCount: matches.length
            };
        } catch (error) {
            console.error('[MATCHING-ENGINE] Error calling Claude API:', error);
            throw error;
        }
    }

    /**
     * Build the prompt for Claude to match markets
     */
    private buildMatchingPrompt(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[]
    ): string {
        return `You are a market matching engine. Your task is to find similar or identical prediction markets between Polymarket and Kalshi platforms.

Polymarket Markets:
${polymarketRecords.map((r, i) => `${i}. Ticker: ${r.ticker}, Price: $${r.price}, Volume: ${r.volume}, Timestamp: ${r.timestamp}`).join('\n')}

Kalshi Markets:
${kalshiRecords.map((r, i) => `${i}. Ticker: ${r.ticker}, Price: $${r.price}, Volume: ${r.volume}, Timestamp: ${r.timestamp}`).join('\n')}

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
- "exact": Same event, same outcome
- "high": Same event, slightly different outcome or time frame
- "medium": Related events, similar outcomes
- "low": Loosely related events

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
            // Remove markdown code blocks if present
            const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(jsonText);

            if (!parsed.matches || !Array.isArray(parsed.matches)) {
                console.error('[MATCHING-ENGINE] Invalid response format from Claude');
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

            console.log(`[MATCHING-ENGINE] Parsed ${matches.length} valid matches`);
            return matches;
        } catch (error) {
            console.error('[MATCHING-ENGINE] Error parsing Claude response:', error);
            console.error('[MATCHING-ENGINE] Response text:', responseText);
            return [];
        }
    }

    /**
     * Get arbitrage opportunities (markets with significant price differences)
     */
    async findArbitrageOpportunities(
        filters: MatchFilters = {},
        minPriceDifference: number = 0.05
    ): Promise<MarketMatch[]> {
        const result = await this.matchMarkets(filters);
        
        return result.matches.filter(match => {
            const priceDiff = Math.abs(match.polymarketRecord.price - match.kalshiRecord.price);
            return priceDiff >= minPriceDifference;
        });
    }
}