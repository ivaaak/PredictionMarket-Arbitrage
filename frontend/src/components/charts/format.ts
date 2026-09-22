/** 1234 -> "1.2k", 5_600_000 -> "5.6M". */
export const fmtCompact = (v: number): string =>
    v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`;
