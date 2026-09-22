// Scripted matching runs for the pipeline visualisation. They replay the same
// event stream the backend sends from POST /api/matching/match/stream, entirely
// in the browser: no backend, no LLM calls, no cost. Useful for demos and for
// checking the trace UI against every state (parallel batches, agent failure,
// all-cached, total outage).
import { TraceEvent } from '../types';

export type DemoScenario = 'consensus' | 'single' | 'cached' | 'outage';

export const DEMO_SCENARIOS: { id: DemoScenario; label: string; blurb: string }[] = [
    { id: 'consensus', label: 'Swarm consensus', blurb: '3 agents, 4 batches, one rate-limited agent' },
    { id: 'single', label: 'Single agent', blurb: 'Claude only, 2 batches' },
    { id: 'cached', label: 'All cached', blurb: 'Every pair already judged: zero LLM calls' },
    { id: 'outage', label: 'LLM outage', blurb: 'Every agent fails on a batch' },
];

type Scripted = { at: number; event: TraceEvent };
type Untimed = TraceEvent extends infer E ? (E extends TraceEvent ? Omit<E, 't'> : never) : never;

const AGENTS = [
    { id: 'claude', model: 'claude-sonnet-5' },
    { id: 'gemini', model: 'gemini-2.5-flash' },
    { id: 'chatgpt', model: 'gpt-4o' },
];

/** Deterministic pseudo-random numbers, so a scenario replays identically. */
function rng(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

class Script {
    private items: Scripted[] = [];
    at = 0;
    push(event: Untimed, at = this.at) {
        this.items.push({ at, event: { ...event, t: at } as TraceEvent });
    }
    wait(ms: number) {
        this.at += ms;
    }
    done(): Scripted[] {
        return this.items.sort((a, b) => a.at - b.at);
    }
}

function preamble(s: Script, mode: 'consensus' | 'single', markets: number, candidates: number, reused: number) {
    const agents = mode === 'consensus' ? AGENTS : AGENTS.slice(0, 1);
    s.push({ type: 'config', mode, agents, consensusThreshold: mode === 'consensus' ? 0.6 : null });
    s.push({ type: 'stage', stage: 'fetch', status: 'start', detail: 'Loading open markets from Postgres' });
    s.wait(450);
    s.push({ type: 'stage', stage: 'fetch', status: 'done', stats: { polymarket: markets, kalshi: markets } });
    s.push({ type: 'stage', stage: 'embed', status: 'start', detail: `Embedding ${markets * 2} titles, top 3 neighbours >= 0.5` });
    s.wait(1300);
    s.push({ type: 'stage', stage: 'embed', status: 'done', stats: { candidatePairs: candidates, polyWithCandidates: Math.round(candidates / 2.6) } });
    s.push({ type: 'stage', stage: 'cache', status: 'start', detail: 'Looking up stored LLM verdicts' });
    s.wait(250);
    s.push({ type: 'stage', stage: 'cache', status: 'done', stats: { reused, toJudge: candidates - reused } });
}

function price(s: Script, matches: number, profitable: number) {
    s.push({ type: 'stage', stage: 'price', status: 'start', detail: 'Pricing hedges from current order books' });
    s.wait(180);
    s.push({ type: 'stage', stage: 'price', status: 'done', stats: { matches, priced: Math.max(0, matches - 1), profitable } });
}

/**
 * LLM batches run up to 3 at a time, like the engine's worker pool. Returns
 * accepted pairs per batch and when the last one finished.
 */
function judge(
    s: Script,
    batches: { pm: number; pairs: number }[],
    agents: string[],
    rand: () => number,
    fails: (batch: number, agent: string) => string | null,
) {
    const start = s.at;
    const slots = [start, start, start];
    let accepted = 0;
    let judgedMatched = 0;

    batches.forEach((b, i) => {
        const slot = slots.indexOf(Math.min(...slots));
        const t0 = slots[slot] + (slots[slot] === start ? slot * 350 : 60);
        s.push({ type: 'batch', batch: i, total: batches.length, status: 'start', polyMarkets: b.pm, pairs: b.pairs }, t0);

        const votes: Record<string, number> = {};
        let end = t0;
        agents.forEach(agent => {
            s.push({ type: 'agent', batch: i, agent, status: 'start' }, t0 + 20);
            const ms = Math.round(1400 + rand() * 3200);
            const error = fails(i, agent);
            if (error) {
                s.push({ type: 'agent', batch: i, agent, status: 'failed', error }, t0 + Math.round(ms * 0.6));
            } else {
                const proposed = 1 + Math.floor(rand() * Math.min(6, b.pairs / 4));
                votes[agent] = proposed;
                s.push({ type: 'agent', batch: i, agent, status: 'done', ms, proposed }, t0 + ms);
            }
            end = Math.max(end, t0 + ms);
        });

        const responded = Object.keys(votes);
        if (responded.length === 0) {
            s.push({ type: 'batch', batch: i, total: batches.length, status: 'failed', polyMarkets: b.pm, pairs: b.pairs, error: 'All AI agents failed to respond' }, end + 10);
        } else {
            const acc = agents.length > 1
                ? Math.max(0, Math.min(...Object.values(votes)) - (responded.length < agents.length ? 0 : 1))
                : votes[responded[0]];
            accepted += acc;
            judgedMatched += acc;
            if (agents.length > 1) {
                s.push({
                    type: 'consensus', batch: i, responded,
                    requiredVotes: Math.ceil(responded.length * 0.6),
                    accepted: acc, proposedPairs: acc + Math.floor(rand() * 4) + 1, votes,
                }, end + 10);
            }
            s.push({ type: 'batch', batch: i, total: batches.length, status: 'done', polyMarkets: b.pm, pairs: b.pairs, accepted: acc }, end + 15);
        }
        slots[slot] = end + 15;
    });

    s.at = Math.max(...slots) + 40;
    return { accepted, judgedMatched };
}

export function demoScript(scenario: DemoScenario): Scripted[] {
    const s = new Script();
    const rand = rng(scenario.length * 97 + 13);

    switch (scenario) {
        case 'consensus': {
            preamble(s, 'consensus', 60, 142, 31);
            const batches = [{ pm: 15, pairs: 34 }, { pm: 15, pairs: 31 }, { pm: 15, pairs: 29 }, { pm: 7, pairs: 17 }];
            s.push({ type: 'stage', stage: 'judge', status: 'start', detail: `${batches.length} batch(es), up to 3 in parallel`, stats: { batches: batches.length, pairs: 111 } });
            const { accepted } = judge(s, batches, AGENTS.map(a => a.id), rand,
                (b, a) => (a === 'gemini' && b === 2 ? '429 Resource exhausted (rate limited)' : null));
            s.push({ type: 'stage', stage: 'judge', status: 'done', stats: { judged: 111, matched: accepted } });
            price(s, accepted + 3, 2);
            s.push({ type: 'result', success: true, matches: [], matchedCount: accepted + 3, candidatePairs: 142, newlyJudgedPairs: 111 });
            break;
        }
        case 'single': {
            preamble(s, 'single', 40, 64, 12);
            const batches = [{ pm: 15, pairs: 33 }, { pm: 9, pairs: 19 }];
            s.push({ type: 'stage', stage: 'judge', status: 'start', detail: `${batches.length} batch(es), up to 3 in parallel`, stats: { batches: batches.length, pairs: 52 } });
            const { accepted } = judge(s, batches, ['claude'], rand, () => null);
            s.push({ type: 'stage', stage: 'judge', status: 'done', stats: { judged: 52, matched: accepted } });
            price(s, accepted + 1, 1);
            s.push({ type: 'result', success: true, matches: [], matchedCount: accepted + 1, candidatePairs: 64, newlyJudgedPairs: 52 });
            break;
        }
        case 'cached': {
            preamble(s, 'consensus', 50, 88, 88);
            s.push({ type: 'stage', stage: 'judge', status: 'skipped', detail: 'Every candidate pair already has a stored verdict' });
            price(s, 9, 3);
            s.push({ type: 'result', success: true, matches: [], matchedCount: 9, candidatePairs: 88, newlyJudgedPairs: 0 });
            break;
        }
        case 'outage': {
            preamble(s, 'consensus', 30, 47, 0);
            const batches = [{ pm: 15, pairs: 30 }, { pm: 8, pairs: 17 }];
            s.push({ type: 'stage', stage: 'judge', status: 'start', detail: `${batches.length} batch(es), up to 3 in parallel`, stats: { batches: batches.length, pairs: 47 } });
            const { accepted } = judge(s, batches, AGENTS.map(a => a.id), rand,
                (b, a) => (b === 1 ? `${a === 'chatgpt' ? '503' : '500'} upstream unavailable` : a === 'gemini' ? '429 rate limited' : null));
            s.push({ type: 'stage', stage: 'judge', status: 'done', stats: { judged: 30, matched: accepted } });
            price(s, accepted, 0);
            s.push({ type: 'result', success: true, matches: [], matchedCount: accepted, candidatePairs: 47, newlyJudgedPairs: 30 });
            break;
        }
    }
    return s.done();
}

/**
 * Plays a scenario in real time. `speed` > 1 plays faster. Returns a function
 * that cancels the remaining events.
 */
export function playDemo(
    scenario: DemoScenario,
    onEvent: (event: TraceEvent) => void,
    onDone: () => void,
    speed = 1,
): () => void {
    const timers = demoScript(scenario).map(({ at, event }) =>
        setTimeout(() => {
            onEvent(event);
            if (event.type === 'result' || event.type === 'error') onDone();
        }, at / speed),
    );
    return () => timers.forEach(clearTimeout);
}
