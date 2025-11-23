import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import chalk from 'chalk';
import { PolymarketDataRecord } from '../types/polymarketDataRecord';
import { KalshiDataRecord } from '../types/kalshiDataRecord';
import { AgentMatch, AgentResponse, ConsensusMatch } from '../types/consensus.types';


export class ConsensusService {
    private anthropic: Anthropic;
    private gemini: GoogleGenerativeAI;
    private openai: OpenAI;
    private readonly CONSENSUS_THRESHOLD = 0.6; // 60% of agents must agree

    constructor(
        anthropicKey: string,
        geminiKey: string,
        openaiKey: string
    ) {
        this.anthropic = new Anthropic({ apiKey: anthropicKey });
        this.gemini = new GoogleGenerativeAI(geminiKey);
        this.openai = new OpenAI({ apiKey: openaiKey });
    }

    /**
     * Get consensus matches from all AI agents
     */
    async getConsensusMatches(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches?: Map<number, number[]>
    ): Promise<ConsensusMatch[]> {
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.cyan('Starting multi-agent consensus matching...'));

        const prompt = this.buildPrompt(polymarketRecords, kalshiRecords, quickMatches);

        // Call all agents in parallel
        const [claudeResponse, geminiResponse, gptResponse] = await Promise.allSettled([
            this.callClaude(prompt),
            this.callGemini(prompt),
            this.callChatGPT(prompt)
        ]);

        // Collect successful responses
        const agentResponses: AgentResponse[] = [];

        if (claudeResponse.status === 'fulfilled') {
            agentResponses.push(claudeResponse.value);
        } else {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('Claude failed:'), claudeResponse.reason);
        }

        if (geminiResponse.status === 'fulfilled') {
            agentResponses.push(geminiResponse.value);
        } else {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('Gemini failed:'), geminiResponse.reason);
        }

        if (gptResponse.status === 'fulfilled') {
            agentResponses.push(gptResponse.value);
        } else {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('ChatGPT failed:'), gptResponse.reason);
        }

        if (agentResponses.length === 0) {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('All agents failed'));
            throw new Error('All AI agents failed to respond');
        }

        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.green(`Received responses from ${agentResponses.length} agents`));

        // Build consensus
        const consensusMatches = this.buildConsensus(agentResponses, polymarketRecords, kalshiRecords);

        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.green(`Generated ${consensusMatches.length} consensus matches`));

        return consensusMatches;
    }

    /**
     * Call Claude API
     */
    private async callClaude(prompt: string): Promise<AgentResponse> {
        const startTime = Date.now();
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.blue('Calling Claude...'));

        try {
            const message = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }]
            });

            const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
            const matches = this.parseResponse(responseText);
            const responseTime = Date.now() - startTime;

            console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.blue(`Claude responded in ${responseTime}ms with ${matches.length} matches`));

            return {
                agent: 'claude',
                matches,
                responseTime
            };
        } catch (error) {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('Claude error:'), error);
            throw error;
        }
    }

    /**
     * Call Gemini API
     */
    private async callGemini(prompt: string): Promise<AgentResponse> {
        const startTime = Date.now();
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.yellow('Calling Gemini...'));

        try {
            const model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const matches = this.parseResponse(responseText);
            const responseTime = Date.now() - startTime;

            console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.yellow(`Gemini responded in ${responseTime}ms with ${matches.length} matches`));

            return {
                agent: 'gemini',
                matches,
                responseTime
            };
        } catch (error) {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('Gemini error:'), error);
            throw error;
        }
    }

    /**
     * Call ChatGPT API
     */
    private async callChatGPT(prompt: string): Promise<AgentResponse> {
        const startTime = Date.now();
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.green('Calling ChatGPT...'));

        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 4000
            });

            const responseText = completion.choices[0]?.message?.content || '';
            const matches = this.parseResponse(responseText);
            const responseTime = Date.now() - startTime;

            console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.green(`ChatGPT responded in ${responseTime}ms with ${matches.length} matches`));

            return {
                agent: 'chatgpt',
                matches,
                responseTime
            };
        } catch (error) {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('ChatGPT error:'), error);
            throw error;
        }
    }

    /**
     * Build prompt for AI agents
     */
    private buildPrompt(
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[],
        quickMatches?: Map<number, number[]>
    ): string {
        const polymarketData = polymarketRecords.map((r, i) => 
            `${i}. Ticker: ${r.ticker}\n   Price: $${r.price}, Volume: ${r.volume}\n   Timestamp: ${r.timestamp}`
        ).join('\n\n');

        const kalshiData = kalshiRecords.map((r, i) => 
            `${i}. Ticker: ${r.ticker}\n   Price: $${r.price}, Volume: ${r.volume}\n   Timestamp: ${r.timestamp}`
        ).join('\n\n');

        let hints = '';
        if (quickMatches && quickMatches.size > 0) {
            hints = '\n\nPre-filtered potential matches (high token similarity):';
            quickMatches.forEach((kalshiIndices, polyIndex) => {
                hints += `\n- Polymarket ${polyIndex} may match Kalshi: ${kalshiIndices.join(', ')}`;
            });
        }

        return `You are a market matching engine. Your task is to find similar or identical prediction markets between Polymarket and Kalshi platforms.

Polymarket Markets:
${polymarketData}

Kalshi Markets:
${kalshiData}
${hints}

Please analyze these markets and return matching pairs in the following JSON format:
{
  "matches": [
    {
      "polymarketIndex": 0,
      "kalshiIndex": 0,
      "similarity": "exact|high|medium|low",
      "confidence": 0.95,
      "reasoning": "Brief explanation of why these markets match"
    }
  ]
}

Matching criteria:
- "exact": Same event, same outcome (confidence >= 0.9)
- "high": Same event, slightly different outcome or time frame (confidence >= 0.75)
- "medium": Related events, similar outcomes (confidence >= 0.6)
- "low": Loosely related events (confidence >= 0.5)

Consider:
1. Similar events even with different wording
2. Time frames and outcomes
3. Pre-filtered hints if provided

Only include matches with confidence >= 0.6. Return valid JSON only, no markdown formatting.`;
    }

    /**
     * Parse AI agent response
     */
    private parseResponse(responseText: string): AgentMatch[] {
        try {
            const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(jsonText);

            if (!parsed.matches || !Array.isArray(parsed.matches)) {
                return [];
            }

            return parsed.matches
                .filter((m: any) => 
                    typeof m.polymarketIndex === 'number' &&
                    typeof m.kalshiIndex === 'number' &&
                    typeof m.confidence === 'number' &&
                    m.confidence >= 0.6
                )
                .map((m: any) => ({
                    polymarketIndex: m.polymarketIndex,
                    kalshiIndex: m.kalshiIndex,
                    similarity: m.similarity || 'low',
                    confidence: m.confidence,
                    reasoning: m.reasoning || 'No reasoning provided'
                }));
        } catch (error) {
            console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red('Error parsing response:'), error);
            return [];
        }
    }

    /**
     * Build consensus from multiple agent responses
     */
    private buildConsensus(
        agentResponses: AgentResponse[],
        polymarketRecords: PolymarketDataRecord[],
        kalshiRecords: KalshiDataRecord[]
    ): ConsensusMatch[] {
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.cyan('Building consensus from agent responses...'));

        // Create a map of all potential matches
        const matchMap = new Map<string, {
            votes: Map<string, AgentMatch>;
            agentVotes: string[];
        }>();

        // Collect all matches from all agents
        for (const response of agentResponses) {
            for (const match of response.matches) {
                const key = `${match.polymarketIndex}:${match.kalshiIndex}`;
                
                if (!matchMap.has(key)) {
                    matchMap.set(key, {
                        votes: new Map(),
                        agentVotes: []
                    });
                }

                const matchData = matchMap.get(key)!;
                matchData.votes.set(response.agent, match);
                matchData.agentVotes.push(response.agent);
            }
        }

        // Calculate consensus matches
        const consensusMatches: ConsensusMatch[] = [];
        const totalAgents = agentResponses.length;
        const requiredVotes = Math.ceil(totalAgents * this.CONSENSUS_THRESHOLD);

        matchMap.forEach((matchData, key) => {
            const voteCount = matchData.agentVotes.length;
            const consensusScore = voteCount / totalAgents;

            // Only include matches that meet the consensus threshold
            if (voteCount >= requiredVotes) {
                const votes = Array.from(matchData.votes.values());
                const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

                // Use the match data from the agent with highest confidence
                const bestMatch = votes.reduce((best, current) => 
                    current.confidence > best.confidence ? current : best
                );

                // Validate indices
                if (
                    bestMatch.polymarketIndex >= 0 &&
                    bestMatch.polymarketIndex < polymarketRecords.length &&
                    bestMatch.kalshiIndex >= 0 &&
                    bestMatch.kalshiIndex < kalshiRecords.length
                ) {
                    consensusMatches.push({
                        ...bestMatch,
                        agentVotes: matchData.agentVotes,
                        consensusScore,
                        averageConfidence: avgConfidence
                    });
                }
            }
        });

        // Sort by consensus score, then by average confidence
        consensusMatches.sort((a, b) => {
            if (a.consensusScore !== b.consensusScore) {
                return b.consensusScore - a.consensusScore;
            }
            return b.averageConfidence - a.averageConfidence;
        });

        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.green(`Built ${consensusMatches.length} consensus matches`));
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.gray(`  - Required votes: ${requiredVotes}/${totalAgents}`));
        
        return consensusMatches;
    }

    /**
     * Get detailed consensus statistics
     */
    getConsensusStatistics(consensusMatches: ConsensusMatch[]): {
        totalMatches: number;
        unanimousMatches: number;
        majorityMatches: number;
        averageConsensusScore: number;
        averageConfidence: number;
    } {
        const totalMatches = consensusMatches.length;
        const unanimousMatches = consensusMatches.filter(m => m.consensusScore === 1).length;
        const majorityMatches = consensusMatches.filter(m => m.consensusScore >= this.CONSENSUS_THRESHOLD && m.consensusScore < 1).length;
        
        const avgConsensusScore = totalMatches > 0
            ? consensusMatches.reduce((sum, m) => sum + m.consensusScore, 0) / totalMatches
            : 0;
        
        const avgConfidence = totalMatches > 0
            ? consensusMatches.reduce((sum, m) => sum + m.averageConfidence, 0) / totalMatches
            : 0;

        return {
            totalMatches,
            unanimousMatches,
            majorityMatches,
            averageConsensusScore: Number(avgConsensusScore.toFixed(3)),
            averageConfidence: Number(avgConfidence.toFixed(3))
        };
    }
}