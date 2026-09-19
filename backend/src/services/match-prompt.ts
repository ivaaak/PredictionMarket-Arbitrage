// src/services/match-prompt.ts
//
// The one prompt and parser every LLM agent uses, so single-agent and
// consensus modes judge pairs by the same rules.
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';
import { AgentMatch } from '../types/consensus.types';

/**
 * A slice of the matching problem sized for one LLM call: a few Polymarket
 * markets, the Kalshi markets that are candidates for any of them, and the
 * candidate pairs (batch-local indices) the model is asked to judge.
 */
export interface MatchBatch {
    polymarket: PolymarketDataRecord[];
    kalshi: KalshiDataRecord[];
    candidates: Map<number, number[]>;
}

export const MIN_MATCH_CONFIDENCE = 0.6;

const RULES_EXCERPT_CHARS = 400;

function excerpt(text?: string | null): string {
    if (!text) return 'n/a';
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > RULES_EXCERPT_CHARS ? `${flat.slice(0, RULES_EXCERPT_CHARS)}…` : flat;
}

function closeDate(value?: string | null): string {
    return value ? new Date(value).toISOString().slice(0, 10) : 'n/a';
}

function describePolymarket(r: PolymarketDataRecord, i: number): string {
    return `P${i}. ${r.title || r.ticker}
   Event: ${r.event_title || 'n/a'}
   YES means: ${r.outcome || 'Yes'}
   Closes: ${closeDate(r.close_time)}
   Rules: ${excerpt(r.rules)}`;
}

function describeKalshi(r: KalshiDataRecord, i: number): string {
    return `K${i}. ${r.title || r.ticker}
   Event: ${r.event_title || 'n/a'}
   YES means: ${r.subtitle || 'Yes'}
   Closes: ${closeDate(r.close_time)}
   Rules: ${excerpt(r.rules)}`;
}

export function buildMatchPrompt(batch: MatchBatch): string {
    const polymarket = batch.polymarket.map(describePolymarket).join('\n\n');
    const kalshi = batch.kalshi.map(describeKalshi).join('\n\n');
    const pairs = Array.from(batch.candidates.entries())
        .map(([p, ks]) => `- P${p} vs ${ks.map(k => `K${k}`).join(', ')}`)
        .join('\n');

    return `You verify whether prediction markets on Polymarket and Kalshi are the SAME bet, for cross-exchange arbitrage. A pair is only useful if holding YES on one and the opposite side on the other is guaranteed to pay out exactly once, so "related" or "similar topic" is NOT a match.

Polymarket markets:
${polymarket}

Kalshi markets:
${kalshi}

Candidate pairs to judge (found by text similarity, most are NOT matches):
${pairs}

For each candidate pair, it is a match only if both markets resolve on the same underlying event, with the same threshold/outcome, over the same time window, so that they cannot resolve inconsistently. Pay close attention to:
- dates and deadlines ("by June 30" vs "by end of year"), and close dates
- numeric thresholds and ranges ("above 4.5%" vs "4.25-4.5%")
- which outcome YES refers to in multi-outcome events (candidate, team, bracket)
- resolution sources that could plausibly disagree

Direction:
- "same": YES on the Polymarket market pays out in exactly the cases YES on the Kalshi market does.
- "inverted": YES on the Polymarket market pays out in exactly the cases NO on the Kalshi market does (e.g. "Will X win?" vs "Will Y win?" in a two-way race).

Similarity:
- "exact": same event, same resolution criteria and deadline.
- "high": same event and criteria, worded differently or with a different but equivalent resolution source.

Return ONLY a JSON object, no markdown, listing the pairs that are matches (omit non-matches):
{"matches": [{"polymarketIndex": 0, "kalshiIndex": 0, "similarity": "exact", "direction": "same", "confidence": 0.95, "reasoning": "short explanation"}]}

Use the numbers from the P/K labels. Only include matches with confidence >= ${MIN_MATCH_CONFIDENCE}. If none match, return {"matches": []}.`;
}

function extractJsonObject(text: string): unknown {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object in model response');
    return JSON.parse(text.slice(start, end + 1));
}

/**
 * Parses a model response into matches, discarding anything malformed or not
 * among the candidate pairs the model was asked about. Throws when the
 * response is not parseable at all, so a garbled answer is not mistaken for
 * "no matches" and cached as such.
 */
export function parseMatchResponse(responseText: string, batch: MatchBatch): AgentMatch[] {
    const parsed = extractJsonObject(responseText) as { matches?: unknown };
    if (!Array.isArray(parsed.matches)) throw new Error('Model response has no "matches" array');

    const matches: AgentMatch[] = [];
    for (const raw of parsed.matches as Record<string, unknown>[]) {
        const { polymarketIndex, kalshiIndex, similarity, direction, confidence, reasoning } = raw ?? {};
        if (
            typeof polymarketIndex === 'number' &&
            typeof kalshiIndex === 'number' &&
            batch.candidates.get(polymarketIndex)?.includes(kalshiIndex) &&
            (similarity === 'exact' || similarity === 'high') &&
            (direction === 'same' || direction === 'inverted') &&
            typeof confidence === 'number' &&
            confidence >= MIN_MATCH_CONFIDENCE
        ) {
            matches.push({
                polymarketIndex,
                kalshiIndex,
                similarity,
                direction,
                confidence: Math.min(1, confidence),
                reasoning: typeof reasoning === 'string' ? reasoning : 'No reasoning provided'
            });
        }
    }
    return matches;
}
