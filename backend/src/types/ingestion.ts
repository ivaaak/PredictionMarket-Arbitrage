export type IngestionSource = 'polymarket' | 'kalshi';

export const INGESTION_SOURCES: IngestionSource[] = ['polymarket', 'kalshi'];

/** Called after every sweep: saved row count, or an error message if the fetch or DB write failed. */
export type SweepListener = (savedCount: number, error?: string) => void;

export interface SourceStatus {
    running: boolean;
    intervalMs: number;
    sweeps: number;
    lastSweepAt: string | null;
    lastSweepCount: number | null;
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
