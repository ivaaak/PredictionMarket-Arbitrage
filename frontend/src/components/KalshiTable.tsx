import { MarketTable } from './MarketTable';

export function KalshiTable(props: { search: string; onSearchChange: (search: string) => void }) {
    return <MarketTable endpoint="/api/kalshi" variant="kalshi" {...props} />;
}
