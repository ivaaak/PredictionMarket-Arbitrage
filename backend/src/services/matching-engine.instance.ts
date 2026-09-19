// src/services/matching-engine.instance.ts
//
// The matching engine owns an in-memory result cache and lazily loads the local
// MiniLM embedding model (~80MB). Constructing one per controller would double
// both, so every route shares this single instance.
import chalk from 'chalk';
import { ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY } from '../config';
import { MatchingEngineService } from './matching-engine.service';

if (!ANTHROPIC_API_KEY) {
    console.warn(
        chalk.yellow.bold('[MATCHING-ENGINE]'),
        chalk.red('ANTHROPIC_API_KEY is not set - matching requests will fail.')
    );
}

export const matchingEngine = new MatchingEngineService(
    ANTHROPIC_API_KEY,
    GEMINI_API_KEY || undefined,
    OPENAI_API_KEY || undefined
);
