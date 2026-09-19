import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import chalk from 'chalk';
import { CLAUDE_MODEL, GEMINI_MODEL, OPENAI_MODEL } from '../config';
import { AgentMatch, AgentResponse, ConsensusMatch } from '../types/consensus.types';
import { buildMatchPrompt, MatchBatch, parseMatchResponse } from './match-prompt';

const MAX_OUTPUT_TOKENS = 4000;

/**
 * Asks Claude alone. Used directly in single-agent mode and as one voter in
 * consensus mode.
 */
export async function callClaude(anthropic: Anthropic, batch: MatchBatch): Promise<AgentMatch[]> {
    const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: buildMatchPrompt(batch) }]
    });
    const text = message.content.map(block => (block.type === 'text' ? block.text : '')).join('');
    return parseMatchResponse(text, batch);
}

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
    async getConsensusMatches(batch: MatchBatch): Promise<ConsensusMatch[]> {
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.cyan('Starting multi-agent consensus matching...'));

        const agents: [string, () => Promise<AgentMatch[]>][] = [
            ['claude', () => callClaude(this.anthropic, batch)],
            ['gemini', () => this.callGemini(batch)],
            ['chatgpt', () => this.callChatGPT(batch)]
        ];

        const settled = await Promise.allSettled(agents.map(([, call]) => this.timed(call)));

        const agentResponses: AgentResponse[] = [];
        settled.forEach((result, i) => {
            const agent = agents[i][0];
            if (result.status === 'fulfilled') {
                agentResponses.push({ agent, ...result.value });
                console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.gray(`${agent} responded in ${result.value.responseTime}ms with ${result.value.matches.length} matches`));
            } else {
                console.error(chalk.magenta.bold('[CONSENSUS]'), chalk.red(`${agent} failed:`), result.reason);
            }
        });

        if (agentResponses.length === 0) {
            throw new Error('All AI agents failed to respond');
        }

        const consensusMatches = this.buildConsensus(agentResponses);
        console.log(chalk.magenta.bold('[CONSENSUS]'), chalk.green(`Generated ${consensusMatches.length} consensus matches from ${agentResponses.length} agents`));
        return consensusMatches;
    }

    private async timed(call: () => Promise<AgentMatch[]>): Promise<{ matches: AgentMatch[]; responseTime: number }> {
        const start = Date.now();
        const matches = await call();
        return { matches, responseTime: Date.now() - start };
    }

    private async callGemini(batch: MatchBatch): Promise<AgentMatch[]> {
        const model = this.gemini.getGenerativeModel({
            model: GEMINI_MODEL,
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT_TOKENS }
        });
        const result = await model.generateContent(buildMatchPrompt(batch));
        return parseMatchResponse(result.response.text(), batch);
    }

    private async callChatGPT(batch: MatchBatch): Promise<AgentMatch[]> {
        const completion = await this.openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [{ role: 'user', content: buildMatchPrompt(batch) }],
            response_format: { type: 'json_object' },
            max_tokens: MAX_OUTPUT_TOKENS
        });
        return parseMatchResponse(completion.choices[0]?.message?.content || '', batch);
    }

    /**
     * A pair is accepted when enough agents name it WITH THE SAME DIRECTION.
     * Agents that agree two markets match but disagree on which sides line up
     * are not in agreement: one of them would put both legs on the same side.
     */
    private buildConsensus(agentResponses: AgentResponse[]): ConsensusMatch[] {
        const votesByKey = new Map<string, Map<string, AgentMatch>>();

        for (const response of agentResponses) {
            for (const match of response.matches) {
                const key = `${match.polymarketIndex}:${match.kalshiIndex}:${match.direction}`;
                if (!votesByKey.has(key)) votesByKey.set(key, new Map());
                // One vote per agent, even if it repeats a pair.
                votesByKey.get(key)!.set(response.agent, match);
            }
        }

        const totalAgents = agentResponses.length;
        const requiredVotes = Math.ceil(totalAgents * this.CONSENSUS_THRESHOLD);
        const consensusMatches: ConsensusMatch[] = [];

        votesByKey.forEach((votes) => {
            if (votes.size < requiredVotes) return;

            const all = Array.from(votes.values());
            const best = all.reduce((a, b) => (b.confidence > a.confidence ? b : a));
            // Similarity is only as strong as the most cautious voter's.
            const similarity = all.every(v => v.similarity === 'exact') ? 'exact' : 'high';

            consensusMatches.push({
                ...best,
                similarity,
                agentVotes: Array.from(votes.keys()),
                consensusScore: votes.size / totalAgents,
                averageConfidence: all.reduce((sum, v) => sum + v.confidence, 0) / all.length
            });
        });

        return consensusMatches.sort((a, b) =>
            b.consensusScore - a.consensusScore || b.averageConfidence - a.averageConfidence
        );
    }
}
