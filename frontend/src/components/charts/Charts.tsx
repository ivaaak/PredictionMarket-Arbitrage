import { ReactNode, useRef, useState } from 'react';
import styles from './Charts.module.css';
import { fmtCompact as compact } from './format';

export interface Series {
    name: string;
    color: string;
    values: number[];
}

interface Tip {
    x: number;
    y: number;
    content: ReactNode;
}

/** Tooltip positioned inside a relatively positioned chart frame. */
function useTip() {
    const frameRef = useRef<HTMLDivElement>(null);
    const [tip, setTip] = useState<Tip | null>(null);
    const show = (clientX: number, clientY: number, content: ReactNode) => {
        const box = frameRef.current?.getBoundingClientRect();
        if (!box) return;
        setTip({ x: clientX - box.left, y: clientY - box.top, content });
    };
    const el = tip && (
        <div
            className={styles.tooltip}
            style={{
                left: tip.x,
                top: tip.y,
                transform: `translate(${tip.x > (frameRef.current?.clientWidth ?? 0) / 2 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
            }}
        >
            {tip.content}
        </div>
    );
    return { frameRef, show, hide: () => setTip(null), el };
}

export function Legend({ series }: { series: { name: string; color: string }[] }) {
    return (
        <div className={styles.legend}>
            {series.map(s => (
                <span key={s.name} className={styles.legendItem}>
                    <span className={styles.swatch} style={{ background: s.color }} />
                    {s.name}
                </span>
            ))}
        </div>
    );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
    return (
        <div className={styles.tipRow}>
            <span className={styles.swatch} style={{ background: color }} />
            <span className={styles.tipLabel}>{label}</span>
            <span className={styles.tipValue}>{value}</span>
        </div>
    );
}

/** "Nice" upper bound so gridlines land on round numbers. */
function niceMax(v: number): number {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
}


/** Bar with 4px rounded top corners, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
    if (h <= 0) return '';
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

const W = 640;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

// ---------------------------------------------------------------- line chart

interface LineChartProps {
    series: Series[];
    xLabels: string[];
    height?: number;
    format?: (v: number) => string;
}

export function LineChart({ series, xLabels, height = 220, format = compact }: LineChartProps) {
    const { frameRef, show, hide, el } = useTip();
    const [hover, setHover] = useState<number | null>(null);
    const n = xLabels.length;
    // Counts: keep at least 4 so the quarter gridlines stay on whole numbers.
    const max = niceMax(Math.max(4, ...series.flatMap(s => s.values)));
    const iw = W - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v: number) => PAD.top + ih - (v / max) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * max);
    const labelEvery = Math.max(1, Math.ceil(n / 8));

    const onMove = (e: React.MouseEvent<SVGRectElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - box.left) / box.width) * iw;
        const i = Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1))));
        setHover(i);
        show(e.clientX, e.clientY, (
            <>
                <div className={styles.tipTitle}>{xLabels[i]}</div>
                {series.map(s => <TipRow key={s.name} color={s.color} label={s.name} value={format(s.values[i] ?? 0)} />)}
            </>
        ));
    };

    return (
        <div className={styles.frame} ref={frameRef}>
            <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label="Line chart">
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.baseline : styles.grid} />
                        <text x={PAD.left - 6} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">{format(t)}</text>
                    </g>
                ))}
                {xLabels.map((l, i) => i % labelEvery === 0 && (
                    <text key={i} x={x(i)} y={height - 8} className={styles.axisLabel} textAnchor="middle">{l}</text>
                ))}
                {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} className={styles.crosshair} />}
                {series.map(s => (
                    <polyline
                        key={s.name}
                        points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ))}
                {hover !== null && series.map(s => (
                    <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} className={styles.ring} />
                ))}
                <rect
                    x={PAD.left} y={PAD.top} width={iw} height={ih}
                    fill="transparent"
                    onMouseMove={onMove}
                    onMouseLeave={() => { setHover(null); hide(); }}
                />
            </svg>
            {el}
        </div>
    );
}

// -------------------------------------------------------- grouped bar chart

interface GroupedBarsProps {
    categories: string[];
    series: Series[];
    height?: number;
    format?: (v: number) => string;
}

export function GroupedBars({ categories, series, height = 220, format = compact }: GroupedBarsProps) {
    const { frameRef, show, hide, el } = useTip();
    const [hover, setHover] = useState<string | null>(null);
    const max = niceMax(Math.max(0.0001, ...series.flatMap(s => s.values)));
    const iw = W - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const groupW = iw / categories.length;
    const GAP = 2;
    const barW = Math.max(2, (groupW * 0.72 - GAP * (series.length - 1)) / series.length);
    const y = (v: number) => PAD.top + ih - (v / max) * ih;
    const ticks = [0, 0.5, 1].map(t => t * max);

    return (
        <div className={styles.frame} ref={frameRef}>
            <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label="Grouped bar chart">
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
                        <text x={PAD.left - 6} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">{format(t)}</text>
                    </g>
                ))}
                {categories.map((c, ci) => {
                    const gx = PAD.left + ci * groupW + (groupW - (barW * series.length + GAP * (series.length - 1))) / 2;
                    return (
                        <g key={c}>
                            {series.map((s, si) => {
                                const v = s.values[ci] ?? 0;
                                const bx = gx + si * (barW + GAP);
                                const key = `${ci}:${si}`;
                                return (
                                    <g key={s.name}>
                                        <path d={barPath(bx, y(v), barW, PAD.top + ih - y(v))} fill={s.color} opacity={hover && hover !== key ? 0.45 : 1} />
                                        {/* Hit target taller and wider than the mark. */}
                                        <rect
                                            x={bx - GAP / 2} y={PAD.top} width={barW + GAP} height={ih}
                                            fill="transparent"
                                            onMouseMove={(e) => {
                                                setHover(key);
                                                show(e.clientX, e.clientY, (
                                                    <>
                                                        <div className={styles.tipTitle}>{c}</div>
                                                        <TipRow color={s.color} label={s.name} value={format(v)} />
                                                    </>
                                                ));
                                            }}
                                            onMouseLeave={() => { setHover(null); hide(); }}
                                        />
                                    </g>
                                );
                            })}
                            <text x={PAD.left + ci * groupW + groupW / 2} y={height - 8} className={styles.axisLabel} textAnchor="middle">{c}</text>
                        </g>
                    );
                })}
                <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} className={styles.baseline} />
            </svg>
            {el}
        </div>
    );
}

// ---------------------------------------------------- horizontal bar list

interface BarListItem {
    key: string;
    label: string;
    sub?: string;
    value: number;
    display: string;
}

export function BarList({ items, color }: { items: BarListItem[]; color: string }) {
    const max = Math.max(1e-9, ...items.map(i => Math.abs(i.value)));
    if (items.length === 0) return <div className={styles.empty}>No data yet</div>;
    return (
        <ol className={styles.barList}>
            {items.map((item, i) => (
                <li key={item.key} className={styles.barRow} title={`${item.label} · ${item.display}`}>
                    <span className={styles.barRank}>{String(i + 1).padStart(2, '0')}</span>
                    <div className={styles.barBody}>
                        <div className={styles.barHead}>
                            <span className={styles.barLabel}>{item.label}</span>
                            <span className={styles.barValue}>{item.display}</span>
                        </div>
                        <div className={styles.barTrack}>
                            <div className={styles.barFill} style={{ width: `${(Math.abs(item.value) / max) * 100}%`, background: color }} />
                        </div>
                        {item.sub && <div className={styles.barSub}>{item.sub}</div>}
                    </div>
                </li>
            ))}
        </ol>
    );
}

// ------------------------------------------------------------------ scatter

interface ScatterPoint {
    key: string | number;
    x: number;
    y: number;
    label: string;
}

interface ScatterProps {
    points: ScatterPoint[];
    color: string;
    xLabel: string;
    yLabel: string;
    xFormat: (v: number) => string;
    yFormat: (v: number) => string;
    xDomain?: [number, number];
    height?: number;
}

export function Scatter({ points, color, xLabel, yLabel, xFormat, yFormat, xDomain = [0, 1], height = 240 }: ScatterProps) {
    const { frameRef, show, hide, el } = useTip();
    const [hover, setHover] = useState<string | number | null>(null);
    const pad = { ...PAD, left: 44, bottom: 34 };
    const iw = W - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    const yMax = niceMax(Math.max(0.01, ...points.map(p => p.y)));
    const x = (v: number) => pad.left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * iw;
    const y = (v: number) => pad.top + ih - (v / yMax) * ih;
    const yTicks = [0, 0.5, 1].map(t => t * yMax);
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => xDomain[0] + t * (xDomain[1] - xDomain[0]));

    if (points.length === 0) return <div className={styles.empty}>No stored matches yet</div>;

    return (
        <div className={styles.frame} ref={frameRef}>
            <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label={`${yLabel} by ${xLabel}`}>
                {yTicks.map(t => (
                    <g key={t}>
                        <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.baseline : styles.grid} />
                        <text x={pad.left - 6} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">{yFormat(t)}</text>
                    </g>
                ))}
                {xTicks.map(t => (
                    <text key={t} x={x(t)} y={pad.top + ih + 14} className={styles.axisLabel} textAnchor="middle">{xFormat(t)}</text>
                ))}
                <text x={pad.left + iw / 2} y={height - 4} className={styles.axisTitle} textAnchor="middle">{xLabel}</text>
                {points.map(p => (
                    <circle
                        key={p.key}
                        cx={x(p.x)}
                        cy={y(p.y)}
                        r={hover === p.key ? 7 : 5}
                        fill={color}
                        fillOpacity={hover !== null && hover !== p.key ? 0.3 : 0.8}
                        className={styles.ring}
                    />
                ))}
                {/* Invisible, larger hit targets drawn on top. */}
                {points.map(p => (
                    <circle
                        key={`hit-${p.key}`}
                        cx={x(p.x)}
                        cy={y(p.y)}
                        r={11}
                        fill="transparent"
                        onMouseMove={(e) => {
                            setHover(p.key);
                            show(e.clientX, e.clientY, (
                                <>
                                    <div className={styles.tipTitle}>{p.label}</div>
                                    <TipRow color={color} label={xLabel} value={xFormat(p.x)} />
                                    <TipRow color={color} label={yLabel} value={yFormat(p.y)} />
                                </>
                            ));
                        }}
                        onMouseLeave={() => { setHover(null); hide(); }}
                    />
                ))}
            </svg>
            {el}
        </div>
    );
}
