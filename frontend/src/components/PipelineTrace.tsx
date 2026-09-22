import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PipelineTrace.module.css';
import { TraceEvent, TraceStage } from '../types';
import { DEMO_SCENARIOS, DemoScenario } from './pipelineDemo';

// ------------------------------------------------------------------ model

type Status = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

interface StageState {
    status: Status;
    detail?: string;
    stats?: Record<string, number>;
    startedAt?: number;
    endedAt?: number;
}

interface AgentCall {
    status: Status;
    ms?: number;
    proposed?: number;
    error?: string;
}

interface BatchState {
    id: number;
    status: Status;
    polyMarkets: number;
    pairs: number;
    accepted?: number;
    error?: string;
    agents: Record<string, AgentCall>;
    consensus?: { responded: string[]; requiredVotes: number; accepted: number; proposedPairs: number };
}

interface RunSummary {
    mode: 'consensus' | 'single' | 'pinned' | null;
    agents: { id: string; model: string }[];
    threshold: number | null;
    stages: Record<TraceStage, StageState>;
    batches: BatchState[];
    totalBatches: number;
    elapsed: number;
    finished: boolean;
    error?: string;
}

const STAGES: { id: TraceStage; label: string; blurb: string }[] = [
    { id: 'fetch', label: 'Load', blurb: 'open markets' },
    { id: 'embed', label: 'Embed', blurb: 'vector pre-filter' },
    { id: 'cache', label: 'Recall', blurb: 'stored verdicts' },
    { id: 'judge', label: 'Judge', blurb: 'LLM swarm' },
    { id: 'price', label: 'Price', blurb: 'net edge' },
];

const AGENT_NAMES: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT' };

function summarize(events: TraceEvent[]): RunSummary {
    const stages = Object.fromEntries(STAGES.map(s => [s.id, { status: 'pending' }])) as Record<TraceStage, StageState>;
    const batches = new Map<number, BatchState>();
    const run: RunSummary = { mode: null, agents: [], threshold: null, stages, batches: [], totalBatches: 0, elapsed: 0, finished: false };

    const batch = (id: number): BatchState => {
        if (!batches.has(id)) batches.set(id, { id, status: 'pending', polyMarkets: 0, pairs: 0, agents: {} });
        return batches.get(id)!;
    };

    for (const e of events) {
        run.elapsed = Math.max(run.elapsed, e.t);
        switch (e.type) {
            case 'config':
                run.mode = e.mode;
                run.agents = e.agents;
                run.threshold = e.consensusThreshold;
                break;
            case 'stage': {
                const s = stages[e.stage];
                if (e.status === 'start') Object.assign(s, { status: 'running', startedAt: e.t });
                else Object.assign(s, { status: e.status === 'done' ? 'done' : 'skipped', endedAt: e.t });
                if (e.detail) s.detail = e.detail;
                if (e.stats) s.stats = { ...s.stats, ...e.stats };
                if (e.stage === 'judge' && e.stats?.batches) run.totalBatches = e.stats.batches;
                break;
            }
            case 'batch': {
                const b = batch(e.batch);
                run.totalBatches = e.total;
                Object.assign(b, {
                    status: e.status === 'start' ? 'running' : e.status,
                    polyMarkets: e.polyMarkets,
                    pairs: e.pairs,
                    accepted: e.accepted ?? b.accepted,
                    error: e.error,
                });
                break;
            }
            case 'agent':
                batch(e.batch).agents[e.agent] = {
                    status: e.status === 'start' ? 'running' : e.status,
                    ms: e.ms,
                    proposed: e.proposed,
                    error: e.error,
                };
                break;
            case 'consensus':
                batch(e.batch).consensus = e;
                break;
            case 'result':
                run.finished = true;
                break;
            case 'error':
                run.finished = true;
                run.error = e.error;
                break;
        }
    }

    // Placeholders for batches that have not started yet.
    for (let i = 0; i < run.totalBatches; i++) batch(i);
    run.batches = Array.from(batches.values()).sort((a, b) => a.id - b.id);
    if (run.error) {
        Object.values(stages).forEach(s => { if (s.status === 'running') s.status = 'failed'; });
    }
    return run;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;

function describe(e: TraceEvent): { tag: string; text: string; tone?: 'ok' | 'bad' | 'hot' } {
    switch (e.type) {
        case 'config':
            return {
                tag: 'CONFIG',
                text: `${e.mode} mode · ${e.agents.map(a => `${AGENT_NAMES[a.id] ?? a.id} (${a.model})`).join(', ')}` +
                    (e.consensusThreshold ? ` · ≥${Math.round(e.consensusThreshold * 100)}% must agree` : ''),
            };
        case 'stage': {
            const stats = e.stats ? ' · ' + Object.entries(e.stats).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ') : '';
            return {
                tag: e.stage.toUpperCase(),
                text: `${e.status}${e.detail ? ` · ${e.detail}` : ''}${stats}`,
                tone: e.status === 'done' ? 'ok' : e.status === 'start' ? 'hot' : undefined,
            };
        }
        case 'batch':
            return {
                tag: `BATCH ${String(e.batch + 1).padStart(2, '0')}`,
                text: e.status === 'start'
                    ? `dispatched · ${e.polyMarkets} markets · ${e.pairs} pairs`
                    : e.status === 'done' ? `done · ${e.accepted ?? 0} accepted` : `failed · ${e.error}`,
                tone: e.status === 'failed' ? 'bad' : e.status === 'done' ? 'ok' : 'hot',
            };
        case 'agent':
            return {
                tag: (AGENT_NAMES[e.agent] ?? e.agent).toUpperCase(),
                text: `batch ${e.batch + 1} · ` + (e.status === 'start'
                    ? 'thinking…'
                    : e.status === 'done' ? `answered in ${secs(e.ms ?? 0)} · proposed ${e.proposed}` : `failed · ${e.error}`),
                tone: e.status === 'failed' ? 'bad' : e.status === 'done' ? 'ok' : undefined,
            };
        case 'consensus':
            return {
                tag: 'CONSENSUS',
                text: `batch ${e.batch + 1} · ${e.responded.length} voted · need ${e.requiredVotes} · ${e.accepted}/${e.proposedPairs} pairs accepted`,
                tone: 'ok',
            };
        case 'result':
            return { tag: 'RESULT', text: `${e.matchedCount} matches · ${e.candidatePairs} candidates · ${e.newlyJudgedPairs} newly judged`, tone: 'ok' };
        case 'error':
            return { tag: 'ERROR', text: e.error, tone: 'bad' };
    }
}

// ------------------------------------------------------------ components

function StageStrip({ run }: { run: RunSummary }) {
    const statLine = (id: TraceStage, s: StageState): string => {
        const st = s.stats ?? {};
        switch (id) {
            case 'fetch': return st.polymarket !== undefined ? `${st.polymarket} PM · ${st.kalshi} KL` : '';
            case 'embed': return st.candidatePairs !== undefined ? `${st.candidatePairs} candidate pairs` : '';
            case 'cache': return st.reused !== undefined ? `${st.reused} reused · ${st.toJudge} new` : '';
            case 'judge': return st.judged !== undefined ? `${st.matched}/${st.judged} matched` : st.batches ? `${st.batches} batches` : '';
            case 'price': return st.matches !== undefined ? `${st.profitable}/${st.matches} profitable` : '';
        }
    };
    return (
        <div className={styles.strip}>
            {STAGES.map((stage, i) => {
                const s = run.stages[stage.id];
                const dur = s.startedAt !== undefined && s.endedAt !== undefined ? secs(s.endedAt - s.startedAt) : '';
                return (
                    <div key={stage.id} className={`${styles.stage} ${styles[`stage_${s.status}`]}`} title={s.detail}>
                        <div className={styles.stageTop}>
                            <span>{String(i + 1).padStart(2, '0')} {stage.label}</span>
                            <span className={styles.stageBadge}>
                                {s.status === 'running' ? '●' : s.status === 'done' ? '✓' : s.status === 'skipped' ? '—' : s.status === 'failed' ? '✕' : ''}
                            </span>
                        </div>
                        <div className={styles.stageBlurb}>{stage.blurb}{dur && ` · ${dur}`}</div>
                        <div className={styles.stageStat}>
                            {statLine(stage.id, s) || (s.status === 'skipped' ? 'skipped' : s.status === 'running' ? 'working…' : ' ')}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function BatchDots({ run }: { run: RunSummary }) {
    if (run.batches.length === 0) return null;
    return (
        <div className={styles.dots} aria-label="LLM batches">
            {run.batches.map(b => (
                <span
                    key={b.id}
                    className={`${styles.dot} ${styles[`dot_${b.status}`]}`}
                    title={`Batch ${b.id + 1}: ${b.status}${b.accepted !== undefined ? ` · ${b.accepted} accepted` : ''}`}
                />
            ))}
            <span className={styles.dotsLabel}>
                {run.batches.filter(b => b.status === 'done' || b.status === 'failed').length}/{run.batches.length} batches
            </span>
        </div>
    );
}

/** Batches (left) fan out to every agent (middle), whose votes meet at the hub (right). */
function Swarm({ run }: { run: RunSummary }) {
    const judge = run.stages.judge;
    if (judge.status === 'skipped') {
        return <div className={styles.swarmEmpty}>No LLM calls needed: {judge.detail?.toLowerCase()}</div>;
    }
    if (run.batches.length === 0) {
        return (
            <div className={styles.swarmEmpty}>
                {judge.status === 'pending' && !run.finished ? 'Waiting for candidate pairs…' : 'No pairs were sent to the LLMs'}
            </div>
        );
    }

    const agents = run.agents.length ? run.agents : [{ id: 'claude', model: '' }];
    const W = 640;
    const rowH = run.batches.length > 12 ? Math.max(12, 300 / run.batches.length) : 26;
    // Tall enough for every batch row and ~90px per agent (circle + stats label).
    const H = Math.max(200, run.batches.length * rowH + 40, agents.length * 92 + 30);
    const bx = 70, ax = 330, hx = 560;
    const by = (i: number) => 20 + rowH / 2 + i * ((H - 40) / run.batches.length);
    const ay = (i: number) => 24 + ((H - 50) / agents.length) * (i + 0.5);
    const hy = H / 2;

    const agentTotals = agents.map(a => {
        const calls = run.batches.map(b => b.agents[a.id]).filter(Boolean) as AgentCall[];
        const done = calls.filter(c => c.status === 'done');
        return {
            running: calls.some(c => c.status === 'running'),
            failed: calls.filter(c => c.status === 'failed').length,
            calls: calls.length,
            proposed: done.reduce((n, c) => n + (c.proposed ?? 0), 0),
            avgMs: done.length ? done.reduce((n, c) => n + (c.ms ?? 0), 0) / done.length : 0,
        };
    });
    const accepted = run.batches.reduce((n, b) => n + (b.accepted ?? 0), 0);
    const consensus = run.mode === 'consensus';
    const showBatchLabels = rowH >= 20;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.swarm} role="img" aria-label="LLM agent swarm">
            <text x={bx} y={12} className={styles.colHead} textAnchor="middle">Batches</text>
            <text x={ax} y={12} className={styles.colHead} textAnchor="middle">Agents</text>
            <text x={hx} y={12} className={styles.colHead} textAnchor="middle">{consensus ? 'Consensus' : 'Verdicts'}</text>

            {/* batch -> agent edges */}
            {run.batches.map((b, bi) => agents.map((a, ai) => {
                const call = b.agents[a.id];
                const st: Status = call?.status ?? 'pending';
                const w = st === 'done' ? 1 + Math.min(call?.proposed ?? 0, 8) * 0.35 : 1;
                return (
                    <path
                        key={`${b.id}-${a.id}`}
                        d={`M${bx + 16},${by(bi)} C${(bx + ax) / 2},${by(bi)} ${(bx + ax) / 2},${ay(ai)} ${ax - 26},${ay(ai)}`}
                        className={`${styles.edge} ${styles[`edge_${st}`]}`}
                        strokeWidth={w}
                    >
                        <title>{`Batch ${b.id + 1} → ${AGENT_NAMES[a.id] ?? a.id}: ${st}${call?.ms ? ` · ${secs(call.ms)}` : ''}${call?.proposed !== undefined ? ` · proposed ${call.proposed}` : ''}${call?.error ? ` · ${call.error}` : ''}`}</title>
                    </path>
                );
            }))}

            {/* agent -> hub edges */}
            {agents.map((a, ai) => {
                const t = agentTotals[ai];
                const st: Status = t.running ? 'running' : t.proposed > 0 || t.calls > 0 ? 'done' : 'pending';
                return (
                    <path
                        key={`hub-${a.id}`}
                        d={`M${ax + 26},${ay(ai)} C${(ax + hx) / 2},${ay(ai)} ${(ax + hx) / 2},${hy} ${hx - 34},${hy}`}
                        className={`${styles.edge} ${styles[`edge_${st}`]}`}
                        strokeWidth={1 + Math.min(t.proposed, 20) * 0.15}
                    />
                );
            })}

            {/* batch nodes */}
            {run.batches.map((b, bi) => (
                <g key={b.id}>
                    <rect
                        x={bx - 16} y={by(bi) - Math.min(8, rowH / 2 - 2)} width={32} height={Math.min(16, rowH - 4)}
                        rx={3}
                        className={`${styles.batchNode} ${styles[`node_${b.status}`]}`}
                    >
                        <title>{`Batch ${b.id + 1} · ${b.polyMarkets} markets · ${b.pairs} pairs · ${b.status}${b.accepted !== undefined ? ` · ${b.accepted} accepted` : ''}${b.error ? ` · ${b.error}` : ''}`}</title>
                    </rect>
                    {showBatchLabels && (
                        <>
                            <text x={bx} y={by(bi)} className={styles.nodeLabelInv} textAnchor="middle" dominantBaseline="central">
                                {String(b.id + 1).padStart(2, '0')}
                            </text>
                            <text x={bx - 24} y={by(bi)} className={styles.sideLabel} textAnchor="end" dominantBaseline="central">
                                {b.pairs}p
                            </text>
                        </>
                    )}
                </g>
            ))}

            {/* agent nodes */}
            {agents.map((a, ai) => {
                const t = agentTotals[ai];
                return (
                    <g key={a.id}>
                        <circle cx={ax} cy={ay(ai)} r={24} className={`${styles.agentNode} ${t.running ? styles.agentRunning : ''} ${t.failed ? styles.agentFailed : ''}`} />
                        <text x={ax} y={ay(ai) - 3} className={styles.agentName} textAnchor="middle">{AGENT_NAMES[a.id] ?? a.id}</text>
                        <text x={ax} y={ay(ai) + 9} className={styles.agentModel} textAnchor="middle">{a.model.replace(/^claude-|^gemini-|^gpt-/, '')}</text>
                        <text x={ax} y={ay(ai) + 38} className={styles.sideLabel} textAnchor="middle">
                            {t.calls ? `${t.proposed} proposed · ${t.avgMs ? secs(t.avgMs) : '…'} avg${t.failed ? ` · ${t.failed} failed` : ''}` : 'idle'}
                        </text>
                    </g>
                );
            })}

            {/* hub */}
            <circle cx={hx} cy={hy} r={32} className={`${styles.hub} ${run.stages.judge.status === 'done' ? styles.hubDone : ''}`} />
            <text x={hx} y={hy - 4} className={styles.hubValue} textAnchor="middle">{accepted}</text>
            <text x={hx} y={hy + 11} className={styles.agentModel} textAnchor="middle">accepted</text>
            {consensus && run.threshold && (
                <text x={hx} y={hy + 50} className={styles.sideLabel} textAnchor="middle">
                    ≥{Math.ceil(agents.length * run.threshold)}/{agents.length} agents must agree
                </text>
            )}
        </svg>
    );
}

function Funnel({ run }: { run: RunSummary }) {
    const f = run.stages.fetch.stats ?? {};
    const e = run.stages.embed.stats ?? {};
    const c = run.stages.cache.stats ?? {};
    const j = run.stages.judge.stats ?? {};
    const p = run.stages.price.stats ?? {};
    const rows: { label: string; value: number | undefined; tone?: string }[] = [
        { label: 'Markets loaded', value: f.polymarket !== undefined ? f.polymarket + f.kalshi : undefined },
        { label: 'Candidate pairs', value: e.candidatePairs ?? (c.reused !== undefined ? c.reused + c.toJudge : undefined) },
        { label: 'Reused verdicts', value: c.reused, tone: 'muted' },
        { label: 'Sent to LLMs', value: c.toJudge },
        { label: 'Judged a match', value: j.matched },
        { label: 'Matches priced', value: p.priced },
        { label: 'Profitable after fees', value: p.profitable, tone: 'good' },
    ];
    const max = Math.max(1, ...rows.map(r => r.value ?? 0));
    return (
        <ol className={styles.funnel}>
            {rows.map(r => (
                <li key={r.label} className={styles.funnelRow}>
                    <div className={styles.funnelHead}>
                        <span>{r.label}</span>
                        <span className={styles.funnelValue}>{r.value === undefined ? '—' : r.value.toLocaleString()}</span>
                    </div>
                    <div className={styles.funnelTrack}>
                        <div
                            className={`${styles.funnelFill} ${r.tone === 'good' ? styles.fillGood : r.tone === 'muted' ? styles.fillMuted : ''}`}
                            style={{ width: `${((r.value ?? 0) / max) * 100}%` }}
                        />
                    </div>
                </li>
            ))}
        </ol>
    );
}

function EventLog({ events }: { events: TraceEvent[] }) {
    const ref = useRef<HTMLOListElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [events.length]);
    return (
        <ol className={styles.log} ref={ref}>
            {events.map((e, i) => {
                const d = describe(e);
                return (
                    <li key={i} className={d.tone ? styles[`tone_${d.tone}`] : ''}>
                        <span className={styles.logT}>+{secs(e.t)}</span>
                        <span className={styles.logTag}>{d.tag}</span>
                        <span className={styles.logText}>{d.text}</span>
                    </li>
                );
            })}
        </ol>
    );
}

function DemoLauncher({ onRun, disabled }: { onRun: (s: DemoScenario) => void; disabled: boolean }) {
    const [scenario, setScenario] = useState<DemoScenario>('consensus');
    return (
        <div className={styles.demo}>
            <select
                className={styles.demoSelect}
                value={scenario}
                onChange={(e) => setScenario(e.target.value as DemoScenario)}
                aria-label="Demo scenario"
                title={DEMO_SCENARIOS.find(d => d.id === scenario)?.blurb}
            >
                {DEMO_SCENARIOS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <button type="button" className={styles.demoButton} disabled={disabled} onClick={() => onRun(scenario)}>
                ▶ Demo
            </button>
        </div>
    );
}

// ----------------------------------------------------------------- panel

interface PipelineTraceProps {
    events: TraceEvent[];
    running: boolean;
    /** Set while a scripted demo (not a real run) is playing or was last shown. */
    demo?: DemoScenario | null;
    onRunDemo?: (scenario: DemoScenario) => void;
}

export function PipelineTrace({ events, running, demo, onRunDemo }: PipelineTraceProps) {
    const [open, setOpen] = useState(true);
    const run = useMemo(() => summarize(events), [events]);

    // Tick the clock while a stage is in flight, so a long LLM wait still counts up.
    const [now, setNow] = useState(0);
    const startRef = useRef<number | null>(null);
    useEffect(() => {
        if (!running) { startRef.current = null; return; }
        startRef.current = Date.now();
        const id = setInterval(() => setNow(Date.now() - (startRef.current ?? Date.now())), 200);
        return () => clearInterval(id);
    }, [running]);

    const launcher = onRunDemo && <DemoLauncher onRun={onRunDemo} disabled={running && !demo} />;

    if (events.length === 0 && !running) {
        return (
            <section className={styles.panel}>
                <header className={styles.head}>
                    <div>
                        <div className={styles.title}>Matching pipeline · idle</div>
                        <div className={styles.sub}>
                            Analyze markets to watch it live, or replay a scripted demo (no LLM calls)
                        </div>
                    </div>
                    <div className={styles.headRight}>{launcher}</div>
                </header>
            </section>
        );
    }

    const elapsed = running ? Math.max(run.elapsed, now) : run.elapsed;
    const modeLabel = run.mode === 'consensus' ? 'Multi-agent consensus' : run.mode === 'pinned' ? 'Manual pair' : run.mode === 'single' ? 'Single agent' : 'Starting';

    return (
        <section className={styles.panel}>
            <header className={styles.head}>
                <div>
                    <div className={styles.title}>
                        Matching pipeline · {running ? 'live trace' : run.error ? 'last run failed' : 'last run'}
                        {demo && <span className={styles.demoBadge} title="Scripted replay: no backend or LLM calls">Demo</span>}
                    </div>
                    <div className={styles.sub}>
                        {modeLabel} · Load → Embed → Recall → Judge → Price
                    </div>
                </div>
                <div className={styles.headRight}>
                    {launcher}
                    <span className={`${styles.clock} ${running ? styles.clockLive : ''}`}>{secs(elapsed)}</span>
                    <button type="button" className={styles.toggle} onClick={() => setOpen(o => !o)}>
                        {open ? 'Hide' : 'Show'}
                    </button>
                </div>
            </header>

            {open && (
                <>
                    <StageStrip run={run} />
                    <BatchDots run={run} />
                    <div className={styles.body}>
                        <div className={styles.cell}>
                            <div className={styles.cellTitle}>Agent swarm</div>
                            <Swarm run={run} />
                        </div>
                        <div className={styles.cell}>
                            <div className={styles.cellTitle}>Funnel</div>
                            <Funnel run={run} />
                        </div>
                        <div className={`${styles.cell} ${styles.logCell}`}>
                            <div className={styles.cellTitle}>Event tape</div>
                            <EventLog events={events} />
                        </div>
                    </div>
                    {run.error && <div className={styles.errorBar}>✕ {run.error}</div>}
                </>
            )}
        </section>
    );
}
