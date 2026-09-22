export type IngestionSource = 'polymarket' | 'kalshi';

export const INGESTION_SOURCES: IngestionSource[] = ['polymarket', 'kalshi'];

/** What a completed sweep fetched and kept. */
export interface SweepReport {
    saved: number;
    /** Markets the quality filter rejected, by reason. */
    rejected: Record<string, number>;
    /** Stored markets deleted because the sweep no longer returned them. */
    pruned: number;
    /** False when the sweep stopped at the page cap before the catalogue's end. */
    complete: boolean;
}

/** Called after every sweep with its report, or with an error if the fetch or DB write failed. */
export type SweepListener = (report: SweepReport | null, error?: string) => void;

/** What a polling client hands its ingestor after each sweep. */
export interface SweepBatch {
    markets: import('../database/postgres.client').MarketData[];
    rejected: Record<string, number>;
    complete: boolean;
}

export interface SourceStatus {
    running: boolean;
    intervalMs: number;
    sweeps: number;
    lastSweepAt: string | null;
    lastSweepCount: number | null;
    lastRejected: number | null;
    lastRejectedByReason: Record<string, number> | null;
    lastPruned: number | null;
    lastError: string | null;
    lastErrorAt: string | null;
}

export type IngestionStatus = Record<IngestionSource, SourceStatus>;

/** Main thread -> ingestor worker. */
export type IngestorCommand =
    | { type: 'set'; source: IngestionSource; enabled: boolean }
    | { type: 'shutdown' };

/** Ingestor worker -> main thread. */
export type IngestorEvent =
    | { status: 'ready'; message: string }
    | { status: 'error'; message: string; error: string }
    | { status: 'state'; state: IngestionStatus };
