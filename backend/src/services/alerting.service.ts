import axios from 'axios';
import chalk from 'chalk';

export class AlertingService {
    // Replace with your Discord Webhook URL
    private static DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

    static async sendArbitrageAlert(opportunity: {
        polyTicker: string;
        kalshiTicker: string;
        profitPercent: number;
        volume: number;
    }) {
        if (!this.DISCORD_WEBHOOK) return;

        const embed = {
            title: "🚨 ARBITRAGE DETECTED 🚨",
            color: 5763719, // Green
            fields: [
                { name: "Profit Spread", value: `${opportunity.profitPercent.toFixed(2)}%`, inline: true },
                { name: "Polymarket", value: opportunity.polyTicker, inline: true },
                { name: "Kalshi", value: opportunity.kalshiTicker, inline: true },
                { name: "Min Liquidity", value: `$${opportunity.volume}`, inline: false }
            ],
            timestamp: new Date().toISOString()
        };

        try {
            await axios.post(this.DISCORD_WEBHOOK, { embeds: [embed] });
            console.log(chalk.green.bold('[ALERT] Sent Discord notification.'));
        } catch (error) {
            console.error(chalk.red('[ALERT] Failed to send webhook'), error);
        }
    }
}