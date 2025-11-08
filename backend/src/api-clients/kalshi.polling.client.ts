interface KalshiMarket {
    ticker: string;
    title: string;
    subtitle?: string;
    yes_price?: number;
    no_price?: number;
    volume?: number;
    last_price?: number;
}

interface KalshiMarketsResponse {
    markets: KalshiMarket[];
    cursor?: string;
}

export interface KalshiPollingUpdate {
    ticker_name: string;
    price: number;
    volume: number;
    title?: string;
    subtitle?: string;
}

export class KalshiPollingClient {
    private baseUrl = 'https://api.elections.kalshi.com/trade-api/v2';
    private pollingInterval: NodeJS.Timeout | null = null;
    private updateCallback: (data: KalshiPollingUpdate) => void;
    private intervalMs: number;
    private lastPrices: Map<string, number> = new Map();

    constructor(
        updateCallback: (data: KalshiPollingUpdate) => void,
        intervalMs: number = 30000 // Default: poll every 30 seconds
    ) {
        this.updateCallback = updateCallback;
        this.intervalMs = intervalMs;
    }

    /**
     * Fetch markets from Kalshi public API
     */
    private async fetchMarkets(): Promise<KalshiMarket[]> {
        try {
            const response = await fetch(`${this.baseUrl}/markets?limit=100&status=open`);
            
            if (!response.ok) {
                console.error(`[KALSHI-POLLING] API request failed: ${response.status}`);
                return [];
            }

            const data: KalshiMarketsResponse = await response.json();
            return data.markets || [];
        } catch (error) {
            console.error('[KALSHI-POLLING] Error fetching markets:', error);
            return [];
        }
    }

    /**
     * Process market data and call update callback for each market
     */
    private processMarkets(markets: KalshiMarket[]) {
        for (const market of markets) {
            // Use last_price, or calculate from yes_price if available
            const price = market.last_price ?? market.yes_price ?? 0;
            const volume = market.volume ?? 0;

            // Only send updates if price has changed or this is first fetch
            const lastPrice = this.lastPrices.get(market.ticker);
            if (lastPrice === undefined || lastPrice !== price) {
                this.lastPrices.set(market.ticker, price);

                const update: KalshiPollingUpdate = {
                    ticker_name: market.ticker,
                    price: price,
                    volume: volume,
                    title: market.title,
                    subtitle: market.subtitle
                };

                this.updateCallback(update);
            }
        }
    }

    /**
     * Polling function that runs at intervals
     */
    private async poll() {
        console.log('[KALSHI-POLLING] Fetching markets...');
        const markets = await this.fetchMarkets();
        
        if (markets.length > 0) {
            console.log(`[KALSHI-POLLING] Fetched ${markets.length} markets`);
            this.processMarkets(markets);
        } else {
            console.log('[KALSHI-POLLING] No markets fetched');
        }
    }

    /**
     * Start polling for market data
     */
    public startPolling() {
        console.log(`[KALSHI-POLLING] Starting polling every ${this.intervalMs / 1000} seconds`);
        
        // Fetch immediately on start
        this.poll();

        // Then poll at intervals
        this.pollingInterval = setInterval(() => {
            this.poll();
        }, this.intervalMs);
    }

    /**
     * Stop polling
     */
    public stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('[KALSHI-POLLING] Polling stopped');
        }
    }

    /**
     * Check if currently polling
     */
    public isPolling(): boolean {
        return this.pollingInterval !== null;
    }
}