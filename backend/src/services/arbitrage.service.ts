// src/services/arbitrage.service.ts
//
// Prices a cross-venue hedge on a matched pair.
//
// A pair of equivalent binary markets is an arbitrage when buying YES on one
// venue and NO on the other (the combination that pays exactly $1 in every
// outcome) costs less than $1 after fees. That depends on the ASKS of the two
// legs, not on the gap between displayed probabilities: two markets both
// showing 0.50 can be an arbitrage (asks 0.45 / 0.48) and two showing 0.40 and
// 0.60 may not be (wide books).
import { KALSHI_TAKER_FEE_RATE, POLYMARKET_TAKER_FEE_RATE } from '../config';
import { ArbitrageLeg, ArbitrageQuote } from '../types/arbitrage';
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { MatchDirection } from '../types/marketMatch';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';

/**
 * Both venues charge taker fees of the form rate * P * (1 - P) per contract.
 * Kalshi rounds the per-order total up to the cent, which this ignores; at
 * size that rounding is negligible.
 */
function takerFee(rate: number, price: number): number {
    return rate * price * (1 - price);
}

function leg(platform: ArbitrageLeg['platform'], side: ArbitrageLeg['side'], price: number | null | undefined): ArbitrageLeg | null {
    if (price === null || price === undefined || !(price > 0 && price < 1)) return null;
    const rate = platform === 'kalshi' ? KALSHI_TAKER_FEE_RATE : POLYMARKET_TAKER_FEE_RATE;
    return { platform, side, price, fee: takerFee(rate, price) };
}

function quote(a: ArbitrageLeg | null, b: ArbitrageLeg | null): ArbitrageQuote | null {
    if (!a || !b) return null;
    const cost = a.price + b.price;
    const fees = a.fee + b.fee;
    const netEdge = 1 - cost - fees;
    return {
        legs: [a, b],
        cost,
        fees,
        grossEdge: 1 - cost,
        netEdge,
        roi: netEdge / (cost + fees)
    };
}

/**
 * Returns the better of the two possible hedges for the pair, or null when
 * neither can be priced because a required ask is missing.
 *
 * With direction "same", Polymarket YES is hedged by Kalshi NO (and vice
 * versa). With "inverted", Polymarket YES already means Kalshi NO, so it is
 * hedged by Kalshi YES.
 */
export function priceArbitrage(
    poly: PolymarketDataRecord,
    kalshi: KalshiDataRecord,
    direction: MatchDirection
): ArbitrageQuote | null {
    const polyYes = leg('polymarket', 'YES', poly.yes_ask);
    const polyNo = leg('polymarket', 'NO', poly.no_ask);
    const kalshiYes = leg('kalshi', 'YES', kalshi.yes_ask);
    const kalshiNo = leg('kalshi', 'NO', kalshi.no_ask);

    const candidates = direction === 'same'
        ? [quote(polyYes, kalshiNo), quote(polyNo, kalshiYes)]
        : [quote(polyYes, kalshiYes), quote(polyNo, kalshiNo)];

    return candidates.reduce<ArbitrageQuote | null>(
        (best, q) => (q && (!best || q.netEdge > best.netEdge) ? q : best),
        null
    );
}
