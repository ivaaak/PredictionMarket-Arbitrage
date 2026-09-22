// Progress events emitted while a match run executes, streamed to the UI so it
// can show the pipeline's inner workings (stages, LLM batches, agent votes).

export type TraceStage = 'fetch' | 'embed' | 'cache' | 'judge' | 'price';

export type TraceEvent =
    | {
        type: 'config';
        mode: 'consensus' | 'single' | 'pinned';
        agents: { id: string; model: string }[];
        consensusThreshold: number | null;
    }
    | {
        type: 'stage';
        stage: TraceStage;
        status: 'start' | 'done' | 'skipped';
        detail?: string;
        stats?: Record<string, number>;
    }
    | { type: 'batch'; batch: number; total: number; status: 'start' | 'done' | 'failed'; polyMarkets: number; pairs: number; accepted?: number; error?: string }
    | { type: 'agent'; batch: number; agent: string; status: 'start' | 'done' | 'failed'; ms?: number; proposed?: number; error?: string }
    | { type: 'consensus'; batch: number; responded: string[]; requiredVotes: number; accepted: number; proposedPairs: number; votes: Record<string, number> };

/** A trace event as sent over the wire, stamped with ms since the run began. */
export type TimedTraceEvent = TraceEvent & { t: number };

export type TraceListener = (event: TraceEvent) => void;
