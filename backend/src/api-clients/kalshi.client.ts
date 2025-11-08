// src/api-clients/kalshi.client.ts

import WebSocket from 'ws';
import chalk from 'chalk';
import { KALSHI_WEBSOCKET_URL } from '../config';
import { OutgoingHttpHeaders } from 'http';

// --- Types for Data and Events ---

interface KalshiMarketData {
    ticker_name: string;
    price: number;
    volume: number;
    yes_price?: number;
    no_price?: number;
    timestamp?: number;
}

interface WsMessage {
    id?: number;
    type?: 'subscribed' | 'ticker' | 'orderbook_snapshot' | 'orderbook_delta' | 'trade' | 'error' | 'pong';
    msg?: {
        ticker?: string;
        last_price?: number;
        yes_bid?: number;
        no_bid?: number;
        volume?: number;
        [key: string]: any;
    };
    [key: string]: any;
}

type MarketUpdateCallback = (data: KalshiMarketData) => void;

export class KalshiClient {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private marketTickers: Set<string>;
    private updateCallback: MarketUpdateCallback;
    private pingInterval: NodeJS.Timeout | null = null;
    private messageId: number = 1;
    private authHeaders?: OutgoingHttpHeaders;

    // Statistics tracking
    private totalUpdatesReceived: number = 0;
    private filteredUpdatesCount: number = 0;

    constructor(callback: MarketUpdateCallback, authHeaders?: OutgoingHttpHeaders) {
        this.marketTickers = new Set<string>();
        this.updateCallback = callback;
        this.authHeaders = authHeaders;
        console.log(chalk.cyan.bold('\n[KALSHI] 🌙 Kalshi WebSocket Client - Initializing'));

        if (!authHeaders) {
            console.log(chalk.yellow('[KALSHI] ⚠️ No authentication headers provided - connection may fail'));
        }
    }

    public connect(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log(chalk.green('\n[KALSHI] 💚 Already connected.'));
            return;
        }

        console.log(chalk.cyan(`\n[KALSHI] 🔌 Connecting to ${KALSHI_WEBSOCKET_URL}...`));

        // Kalshi requires authentication headers during WebSocket connection
        this.ws = this.authHeaders
            ? new WebSocket(KALSHI_WEBSOCKET_URL, { headers: this.authHeaders })
            : new WebSocket(KALSHI_WEBSOCKET_URL);

        this.ws.on('open', () => {
            this.isConnected = true;
            console.log(chalk.green('\n[KALSHI] ✅ WebSocket connected!'));
            this.subscribeToMarkets();
            this.startPingPong();
        });

        this.ws.on('message', (data) => {
            this.onWsMessage(data);
        });

        this.ws.on('error', (error) => {
            console.error(chalk.red(`\n[KALSHI] ❌ WebSocket Error: ${error.message}`));
        });

        this.ws.on('close', (code, reason) => {
            this.isConnected = false;
            this.stopPingPong();
            console.log(chalk.yellow(`\n[KALSHI] ⚠️ WebSocket connection closed: ${code} - ${reason.toString()}`));
            console.log(chalk.cyan('Reconnecting in 5 seconds...'));
            setTimeout(() => this.connect(), 5000);
        });
    }

    private startPingPong(): void {
        if (this.pingInterval) clearInterval(this.pingInterval);
        // Kalshi uses automatic keepalive, but we can still send pings
        this.pingInterval = setInterval(() => {
            try {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.ping();
                }
            } catch (e) { /* ignore */ }
        }, 30000); // Every 30 seconds
    }

    private stopPingPong(): void {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = null;
    }

    private subscribeToMarkets(): void {
        if (!this.isConnected) {
            return;
        }

        // Subscribe to ticker channel for all markets (general updates)
        const tickerSubscription = {
            id: this.messageId++,
            cmd: 'subscribe',
            params: {
                channels: ['ticker']
            }
        };

        this.ws?.send(JSON.stringify(tickerSubscription));
        console.log(chalk.green('\n[KALSHI] 📡 Subscribed to ticker channel (ALL markets - no filtering).'));
    }

    private onWsMessage(data: WebSocket.Data): void {
        try {
            const message: WsMessage = JSON.parse(data.toString());

            if (message.type === 'subscribed') {
                console.log(chalk.green('\n[KALSHI] ✅ WebSocket subscription confirmed!'));
                return;
            }

            if (message.type === 'pong') {
                return; // Ignore pongs
            }

            if (message.type === 'error') {
                console.error(chalk.red(`\n[KALSHI] ❌ Server error: ${JSON.stringify(message)}`));
                return;
            }

            // Handle ticker updates (real-time market data)
            if (message.type === 'ticker' && message.msg) {
                this.totalUpdatesReceived++;
                const ticker = message.msg.ticker;

                // Process ALL markets (no filtering)
                if (ticker) {
                    const lastPrice = message.msg.last_price || 0;
                    const volume = message.msg.volume || 0;
                    const yesBid = message.msg.yes_bid || 0;
                    const noBid = message.msg.no_bid || 0;

                    const marketData: KalshiMarketData = {
                        ticker_name: ticker,
                        price: lastPrice,
                        volume: volume,
                        yes_price: yesBid,
                        no_price: noBid,
                        timestamp: Date.now()
                    };

                    this.filteredUpdatesCount++;

                    // Print market update information
                    console.log(chalk.green(
                        `\n[KALSHI] ✨ UPDATE: ${ticker} - Price: ${lastPrice.toFixed(2)}, Volume: ${volume}`
                    ));

                    // Call the update callback to save/process the update
                    this.updateCallback(marketData);
                }
            }

            // Handle orderbook updates
            if ((message.type === 'orderbook_snapshot' || message.type === 'orderbook_delta') && message.msg) {
                this.totalUpdatesReceived++;
                const ticker = message.msg.ticker;

                if (ticker) {
                    console.log(chalk.blue(`\n[KALSHI] 📊 Orderbook update for ${ticker}`));
                }
            }
        } catch (e) {
            // Ignore non-JSON messages or parsing errors
        }
    }

    public addMarketSubscription(ticker: string): void {
        if (!this.marketTickers.has(ticker)) {
            this.marketTickers.add(ticker);
            if (this.isConnected) {
                // Subscribe to this specific market's orderbook
                const orderbookSubscription = {
                    id: this.messageId++,
                    cmd: 'subscribe',
                    params: {
                        channels: ['orderbook_delta'],
                        market_ticker: ticker
                    }
                };
                this.ws?.send(JSON.stringify(orderbookSubscription));
                console.log(chalk.green(`\n[KALSHI] 📡 Subscribed to ${ticker}`));
            }
        }
    }

    public startDataFeed(): void {
        console.log(chalk.cyan('\n[KALSHI] 🚀 Starting Kalshi data feed for ALL markets...'));
        this.connect();
    }

    public getStatus(): {
        connected: boolean;
        totalUpdates: number;
        filteredUpdates: number;
        subscribedMarkets: number;
    } {
        return {
            connected: this.isConnected,
            totalUpdates: this.totalUpdatesReceived,
            filteredUpdates: this.filteredUpdatesCount,
            subscribedMarkets: this.marketTickers.size
        };
    }

    public disconnect(): void {
        this.stopPingPong();
        this.ws?.close();
        console.log(chalk.yellow('\n[KALSHI] 👋 WebSocket disconnected.'));
    }
}