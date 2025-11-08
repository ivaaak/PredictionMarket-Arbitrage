// src/api-clients/polymarket.client.ts

import WebSocket from 'ws';
import chalk from 'chalk';
import { POLYMARKET_WEBSOCKET_URL } from '../config';

// --- Types for Data and Events ---

interface PolymarketMarketData {
    marketId: string;
    price: number;
    volume: number;
    title?: string;
    outcome?: string;
    timestamp?: number;
}

interface WsTradeMessage {
    type: 'orders_matched';
    topic: 'activity';
    payload: {
        conditionId: string;
        price: string;
        size: string;
        title?: string;
        outcome?: string;
        timestamp?: number;
        eventSlug?: string;
        slug?: string;
        [key: string]: any;
    };
}

type MarketUpdateCallback = (data: PolymarketMarketData) => void;

export class PolymarketClient {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private marketIds: Set<string>;
    private updateCallback: MarketUpdateCallback;
    private pingInterval: NodeJS.Timeout | null = null;
    
    // Statistics tracking
    private totalTradesReceived: number = 0;
    private filteredTradesCount: number = 0;

    constructor(callback: MarketUpdateCallback) {
        this.marketIds = new Set<string>();
        this.updateCallback = callback;
        console.log(chalk.cyan.bold('\n[POLYMARKET] 🌙 Polymarket WebSocket Client - Initializing'));
    }

    public connect(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log(chalk.green('\n[POLYMARKET] 💚 Already connected.'));
            return;
        }

        console.log(chalk.cyan(`\n[POLYMARKET] 🔌 Connecting to ${POLYMARKET_WEBSOCKET_URL}...`));
        this.ws = new WebSocket(POLYMARKET_WEBSOCKET_URL);

        this.ws.on('open', () => {
            this.isConnected = true;
            console.log(chalk.green('\n[POLYMARKET] ✅ WebSocket connected!'));
            this.subscribeToMarkets();
            this.startPingPong();
        });

        this.ws.on('message', (data) => {
            this.onWsMessage(data);
        });

        this.ws.on('error', (error) => {
            console.error(chalk.red(`\n[POLYMARKET] ❌ WebSocket Error: ${error.message}`));
        });

        this.ws.on('close', (code, reason) => {
            this.isConnected = false;
            this.stopPingPong();
            console.log(chalk.yellow(`\n[POLYMARKET] ⚠️ WebSocket connection closed: ${code} - ${reason.toString()}`));
            console.log(chalk.cyan('\n[POLYMARKET] Reconnecting in 5 seconds...'));
            setTimeout(() => this.connect(), 5000);
        });
    }

    private startPingPong(): void {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            try {
                this.ws?.send(JSON.stringify({ type: 'ping' }));
            } catch (e) { /* ignore */ }
        }, 5000); // Ping every 5 seconds to match template
    }

    private stopPingPong(): void {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = null;
    }

    private subscribeToMarkets(): void {
        if (!this.isConnected) return;

        const subscriptionMsg = {
            action: "subscribe",
            subscriptions: [{ topic: "activity", type: "orders_matched" }]
        };
        
        this.ws?.send(JSON.stringify(subscriptionMsg));
        console.log(chalk.green('\n[POLYMARKET] 📡 Subscribing to real-time activity feed...'));
    }

    private onWsMessage(data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === 'subscribed') {
                console.log(chalk.green('\n[POLYMARKET] ✅ WebSocket subscribed successfully!'));
                this.isConnected = true;
                return;
            }

            if (message.type === 'pong' || !message.topic) {
                return; // Ignore pongs and messages without topics
            }

            if (message.topic === 'activity' && message.type === 'orders_matched') {
                this.totalTradesReceived++;
                const payload: WsTradeMessage['payload'] = message.payload || {};
                const marketId = payload.conditionId;

                // Process ALL trades (no filtering by specific markets)
                if (marketId) {
                    const price = parseFloat(payload.price || '0');
                    const size = parseFloat(payload.size || '0');
                    const usdAmount = price * size;

                    const marketData: PolymarketMarketData = {
                        marketId: marketId,
                        price: price,
                        volume: usdAmount,
                        title: payload.title || 'Unknown Market',
                        outcome: payload.outcome || 'Unknown',
                        timestamp: payload.timestamp || Date.now()
                    };

                    this.filteredTradesCount++;
                    
                    // Print trade information
                    console.log(chalk.green(
                        `\n[POLYMARKET] ✨ TRADE: ${usdAmount.toFixed(0)} - ${marketData.title?.substring(0, 70)}`
                    ));

                    // Call the update callback to save/process the trade
                    this.updateCallback(marketData);
                }
            }
        } catch (e) {
            // Ignore non-JSON messages
        }
    }

    public addMarketSubscription(marketId: string): void {
        this.marketIds.add(marketId);
    }

    public startDataFeed(): void {
        console.log(chalk.cyan('\n[POLYMARKET] 🚀 Starting Polymarket data feed for ALL markets...'));
        this.connect();
    }

    public getStatus(): { 
        connected: boolean; 
        totalTrades: number; 
        filteredTrades: number; 
    } {
        return {
            connected: this.isConnected,
            totalTrades: this.totalTradesReceived,
            filteredTrades: this.filteredTradesCount
        };
    }

    public disconnect(): void {
        this.stopPingPong();
        this.ws?.close();
        console.log(chalk.yellow('\n[POLYMARKET] 👋 WebSocket disconnected.'));
    }
}