export interface ArbitrageLeg {
    platform: 'polymarket' | 'kalshi';
    side: 'YES' | 'NO';
    /** Ask price paid per contract, in dollars. */
    price: number;
    fee: number;
}

/**
 * A locked-in hedge: buying both legs pays exactly $1 whichever way the event
 * resolves, so the profit is 1 - total cost. Quoted per $1 contract pair at
 * the top of book; size is limited by the depth behind those asks.
 */
export interface ArbitrageQuote {
    legs: [ArbitrageLeg, ArbitrageLeg];
    /** Sum of the two asks. */
    cost: number;
    fees: number;
    /** 1 - cost: the edge before fees. */
    grossEdge: number;
    /** 1 - cost - fees: profit per contract pair. */
    netEdge: number;
    /** netEdge / (cost + fees): return on capital until resolution. */
    roi: number;
}
