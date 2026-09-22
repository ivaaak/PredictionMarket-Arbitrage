// src/services/matching-engine.service.ts
//
// Pipeline:
//   1. Load open markets from both platforms (fresh prices every call).
//   2. Embed titles locally and keep each Polymarket market's top-k Kalshi
//      neighbours as candidate pairs.
//   3. Look up stored LLM verdicts for those pairs; only never-seen pairs are
//      sent to the LLM(s), and every answer (match or not) is stored.
//   4. Build matches from positive verdicts and price the hedge from the
//      current order books.
//
// Separating the slow, stable question ("are these the same bet?") from the
// fast, volatile one ("is there an edge right now?") means repeated runs cost
// no LLM calls and never serve stale prices.
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { DEFAULT_MATCH_LIMIT } from '../config';
import { PolymarketService } from './polymarket.service';
import { KalshiService } from './kalshi.service';
import { callClaude, ConsensusService } from './consensus.service';
import { VectorMatchingService } from './vector-matching.service';
import { MatchVerdict, MatchVerdictStore, pairKey } from './match-verdict.store';
import { MatchBatch } from './match-prompt';
import { priceArbitrage } from './arbitrage.service';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { MarketMatch } from '../types/marketMatch';
import { MatchFilters } from '../types/matchFilters';
import { MatchingResult } from '../types/matchingResult';
import { AgentMatch } from '../types/consensus.types';

const LOG = chalk.blue.bold('[MATCHING-ENGINE]');

export class MatchingEngineService {
    private anthropic: Anthropic;
    private consensusService?: ConsensusService;

    // Candidate generation: each Polymarket market keeps its K nearest Kalshi
    // markets that clear a loose similarity floor.
    private readonly CANDIDATES_PER_MARKET = 3;
    private readonly MIN_VECTOR_SIMILARITY = 0.5;
    // Polymarket markets per LLM call (each brings up to K Kalshi candidates).
    private readonly POLY_MARKETS_PER_BATCH = 15;
    private readonly MAX_CONCURRENT_BATCHES = 3;

    constructor(
        anthropicKey: string,
        geminiKey?: string,
        openaiKey?: string,
        useConsensus: boolean = true
    ) {
        this.anthropic = new Anthropic({ apiKey: anthropicKey });

        if (geminiKey && openaiKey && useConsensus) {
            this.consensusService = new ConsensusService(anthropicKey, geminiKey, openaiKey);
            console.log(LOG, chalk.green('Consensus mode enabled with multi-agent matching'));
        } else {
            console.log(LOG, chalk.yellow('Single-agent mode (Claude only)'));
        }

        // Warm the embedding model in the background so the first match request
        // does not pay the download cost. getInstance() memoises the load, so
        // the pre-filter simply awaits the same promise later; a failure here is
        // not fatal because getInstance() retries on the next request.
        VectorMatchingService.getInstance()
            .then(() => console.log(LOG, chalk.green('Vector Matching Service ready.')))
            .catch(err => console.error(
                LOG,
                chalk.yellow('Vector model not preloaded (will retry on first match):'),
                err instanceof Error ? err.message : err
            ));
    }

    private async fetchRecords(filters: MatchFilters): Promise<{
        polymarketRecords: PolymarketDataRecord[];
        kalshiRecords: KalshiDataRecord[];
    }> {
        const limit = filters.limit && filters.limit > 0 ? filters.limit : DEFAULT_MATCH_LIMIT;
        const byRange = filters.startTimestamp && filters.endTimestamp;

        const [polymarketRecords, kalshiRecords] = await Promise.all([
            filters.polymarketTicker
                ? PolymarketService.getByTicker(filters.polymarketTicker, limit)
                : byRange
                    ? PolymarketService.getByTimeRange(filters.startTimestamp!, filters.endTimestamp!)
                    : PolymarketService.getMatchCandidates(limit, filters.search),
            filters.kalshiTicker
                ? KalshiService.getByTicker(filters.kalshiTicker, limit)
                : byRange
                    ? KalshiService.getByTimeRange(filters.startTimestamp!, filters.endTimestamp!)
                    : KalshiService.getMatchCandidates(limit, filters.search)
        ]);

        return {
            polymarketRecords: polymarketRecords.slice(0, limit),
            kalshiRecords: kalshiRecords.slice(0, limit)
        };
    }

    private polymarketText(r: PolymarketDataRecord): string {
        const title = r.title || r.ticker;
        return r.outcome && r.outcome.toLowerCase() !== 'yes' ? `${title} (${r.outcome})` : title;
    }

    private kalshiText(r: KalshiDataRecord): string {
        return [r.event_title, r.title || r.ticker, r.subtitle].filter(Boolean).join(' - ');
    }

    /**
     * Candidate pairs as polyIndex -> kalshiIndices, in the indices of the
     * arrays passed in.
     */
    private async findCandidates(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[]
    ): Promise<Map<number, number[]>> {
        const vectorService = await VectorMatchingService.getInstance();

        const [polyEmbeddings, kalshiEmbeddings] = await Promise.all([
            vectorService.getEmbeddings(polymarketRecords.map(r => this.polymarketText(r))),
            vectorService.getEmbeddings(kalshiRecords.map(r => this.kalshiText(r)))
        ]);

        const neighbours = vectorService.topMatches(
            polyEmbeddings,
            kalshiEmbeddings,
            this.CANDIDATES_PER_MARKET,
            this.MIN_VECTOR_SIMILARITY
        );

        const candidates = new Map<number, number[]>();
        neighbours.forEach((ks, p) => {
            if (ks.length > 0) candidates.set(p, ks);
        });
        return candidates;
    }

    /**
     * Splits the unjudged candidate pairs into LLM-sized batches, each with its
     * own compact index space.
     */
    private buildBatches(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        pairs: Map<number, number[]>
    ): MatchBatch[] {
        const polyIndices = Array.from(pairs.keys());
        const batches: MatchBatch[] = [];

        for (let i = 0; i < polyIndices.length; i += this.POLY_MARKETS_PER_BATCH) {
            const batch: MatchBatch = { polymarket: [], kalshi: [], candidates: new Map() };
            const kalshiLocal = new Map<number, number>();

            for (const p of polyIndices.slice(i, i + this.POLY_MARKETS_PER_BATCH)) {
                const localP = batch.polymarket.push(polymarketRecords[p]) - 1;
                batch.candidates.set(localP, pairs.get(p)!.map(k => {
                    if (!kalshiLocal.has(k)) kalshiLocal.set(k, batch.kalshi.push(kalshiRecords[k]) - 1);
                    return kalshiLocal.get(k)!;
                }));
            }
            batches.push(batch);
        }
        return batches;
    }

    private async judgeBatch(batch: MatchBatch): Promise<AgentMatch[]> {
        if (this.consensusService) {
            return this.consensusService.getConsensusMatches(batch);
        }
        return callClaude(this.anthropic, batch);
    }

    /**
     * Sends batches to the LLM(s) and returns a verdict for every candidate
     * pair in every batch that got an answer. A failed batch yields no
     * verdicts, so its pairs are retried on the next run instead of being
     * recorded as non-matches.
     */
    private async judgePairs(batches: MatchBatch[]): Promise<MatchVerdict[]> {
        const verdicts: MatchVerdict[] = [];
        let next = 0;

        const worker = async () => {
            while (next < batches.length) {
                const batchNumber = next++;
                const batch = batches[batchNumber];
                console.log(LOG, chalk.magenta(`Judging batch ${batchNumber + 1}/${batches.length}`));

                let matches: AgentMatch[];
                try {
                    matches = await this.judgeBatch(batch);
                } catch (error) {
                    console.error(LOG, chalk.red(`Batch ${batchNumber + 1} failed, will retry next run:`), error instanceof Error ? error.message : error);
                    continue;
                }

                const found = new Map(matches.map(m => [`${m.polymarketIndex}:${m.kalshiIndex}`, m]));
                batch.candidates.forEach((ks, p) => {
                    for (const k of ks) {
                        const m = found.get(`${p}:${k}`);
                        verdicts.push({
                            polyTicker: batch.polymarket[p].ticker,
                            kalshiTicker: batch.kalshi[k].ticker,
                            isMatch: !!m,
                            similarity: m?.similarity,
                            direction: m?.direction,
                            confidence: m?.confidence,
                            reasoning: m ? this.describeReasoning(m) : undefined
                        });
                    }
                });
            }
        };

        await Promise.all(Array.from({ length: Math.min(this.MAX_CONCURRENT_BATCHES, batches.length) }, worker));
        return verdicts;
    }

    private describeReasoning(m: AgentMatch): string {
        const consensus = m as Partial<{ consensusScore: number; agentVotes: string[] }>;
        return consensus.agentVotes
            ? `${m.reasoning} (Consensus: ${((consensus.consensusScore ?? 0) * 100).toFixed(0)}% - Voted by: ${consensus.agentVotes.join(', ')})`
            : m.reasoning;
    }

    async matchMarkets(filters: MatchFilters = {}): Promise<MatchingResult> {
        console.log(LOG, chalk.cyan('Starting market matching with filters:'), filters);

        const { polymarketRecords, kalshiRecords } = await this.fetchRecords(filters);
        const empty: MatchingResult = {
            matches: [],
            totalPolymarketRecords: polymarketRecords.length,
            totalKalshiRecords: kalshiRecords.length,
            matchedCount: 0,
            candidatePairs: 0,
            newlyJudgedPairs: 0
        };
        if (polymarketRecords.length === 0 || kalshiRecords.length === 0) return empty;

        // A manually chosen pair is always judged, whatever its vector similarity.
        const pinnedPair = !!(filters.polymarketTicker && filters.kalshiTicker);
        const candidates = pinnedPair
            ? new Map(polymarketRecords.map((_, p) => [p, kalshiRecords.map((_, k) => k)]))
            : await this.findCandidates(polymarketRecords, kalshiRecords);
        const verdicts = await MatchVerdictStore.getForPolymarketTickers(polymarketRecords.map(r => r.ticker));

        const unjudged = new Map<number, number[]>();
        let candidatePairs = 0;
        candidates.forEach((ks, p) => {
            candidatePairs += ks.length;
            const pending = ks.filter(k => !verdicts.has(pairKey(polymarketRecords[p].ticker, kalshiRecords[k].ticker)));
            if (pending.length > 0) unjudged.set(p, pending);
        });

        console.log(LOG, chalk.gray(`${candidatePairs} candidate pairs, ${candidatePairs - Array.from(unjudged.values()).reduce((n, ks) => n + ks.length, 0)} already judged`));

        let newlyJudgedPairs = 0;
        if (unjudged.size > 0) {
            const fresh = await this.judgePairs(this.buildBatches(polymarketRecords, kalshiRecords, unjudged));
            await MatchVerdictStore.saveMany(fresh);
            fresh.forEach(v => verdicts.set(pairKey(v.polyTicker, v.kalshiTicker), v));
            newlyJudgedPairs = fresh.length;
        }

        // Any positive verdict whose two markets are in this run counts, even
        // if the pair was not among this run's vector candidates.
        const kalshiByTicker = new Map(kalshiRecords.map(r => [r.ticker, r]));
        const polyByTicker = new Map(polymarketRecords.map(r => [r.ticker, r]));
        const matches: MarketMatch[] = [];

        verdicts.forEach(v => {
            if (!v.isMatch || !v.direction) return;
            const poly = polyByTicker.get(v.polyTicker);
            const kalshi = kalshiByTicker.get(v.kalshiTicker);
            if (!poly || !kalshi) return;

            matches.push({
                polymarketRecord: poly,
                kalshiRecord: kalshi,
                similarity: v.similarity ?? 'high',
                direction: v.direction,
                confidence: v.confidence ?? 0,
                reasoning: v.reasoning ?? '',
                arbitrage: priceArbitrage(poly, kalshi, v.direction)
            });
        });

        matches.sort((a, b) => b.confidence - a.confidence);

        return {
            ...empty,
            matches,
            matchedCount: matches.length,
            candidatePairs,
            newlyJudgedPairs
        };
    }

    /**
     * Matches whose best hedge clears `minNetEdge` dollars of profit per $1
     * contract pair after fees, best first.
     */
    async findArbitrageOpportunities(filters: MatchFilters = {}, minNetEdge: number = 0): Promise<MarketMatch[]> {
        const result = await this.matchMarkets(filters);
        return result.matches
            .filter(m => m.arbitrage && m.arbitrage.netEdge >= minNetEdge)
            .sort((a, b) => b.arbitrage!.netEdge - a.arbitrage!.netEdge);
    }

    /**
     * Forgets every stored LLM verdict, so all pairs are re-judged on the next run.
     */
    async clearCache(): Promise<void> {
        await MatchVerdictStore.clear();
        // Only clear the embedding cache if the model actually loaded.
        await VectorMatchingService.getInstance()
            .then(service => service.clearCache())
            .catch(() => undefined);
        console.log(LOG, chalk.yellow('Cache cleared'));
    }
}
