import { MarketTable } from './MarketTable';

export function PolymarketTable(props: { search: string; onSearchChange: (search: string) => void }) {
    return <MarketTable endpoint="/api/polymarket" variant="polymarket" {...props} />;
}
