export type SimilarityLevel = 'exact' | 'high' | 'medium' | 'low';

export interface ConsensusMatch {
    polymarketIndex: number;
    kalshiIndex: number;
    similarity: SimilarityLevel;
    confidence: number;
    reasoning: string;
    agentVotes: string[];
    consensusScore: number;
    averageConfidence: number;
}

export interface AgentMatch {
    polymarketIndex: number;
    kalshiIndex: number;
    similarity: SimilarityLevel;
    confidence: number;
    reasoning: string;
}

export interface AgentResponse {
    agent: string;
    matches: AgentMatch[];
    responseTime: number;
    error?: string;
}

export interface ConsensusStatistics {
    totalMatches: number;
    unanimousMatches: number;
    majorityMatches: number;
    averageConsensusScore: number;
    averageConfidence: number;
}

export interface ConsensusConfig {
    anthropicKey: string;
    geminiKey: string;
    openaiKey: string;
    consensusThreshold?: number; // Default: 0.6 (60%)
    enableClaude?: boolean;
    enableGemini?: boolean;
    enableChatGPT?: boolean;
}