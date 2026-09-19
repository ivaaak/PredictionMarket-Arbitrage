export interface MatchFilters {
    startTimestamp?: number;
    endTimestamp?: number;
    polymarketTicker?: string;
    kalshiTicker?: string;
    /** Case-insensitive substring match on market/event titles, applied to both platforms. */
    search?: string;
    /** Max markets per platform to consider, highest volume first. */
    limit?: number;
}
