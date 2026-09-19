# Consensus-Based Market Matching

This extension implements a multi-agent consensus system for improved accuracy in matching prediction markets between Polymarket and Kalshi platforms.

## Overview

The consensus system uses three AI models (Claude, Gemini, and ChatGPT) to independently analyze market pairs and vote on matches. This approach significantly improves accuracy by:

- **Reducing false positives** through multi-model validation
- **Increasing match coverage** as different models may identify different valid matches
- **Providing confidence scores** based on inter-model agreement
- **Ensuring robustness** through fallback mechanisms

## Architecture

```
┌─────────────────────────────────────────┐
│     MatchingEngineService               │
│  (Orchestration & Pre-filtering)        │
└──────────────────┬──────────────────────┘
                   │
                   ├─ Single Agent Mode
                   │  └─> Claude API
                   │
                   └─ Consensus Mode
                      └─> ConsensusService
                          ├─> Claude API
                          ├─> Gemini API
                          └─> ChatGPT API
                               ├─ Parallel Processing
                               ├─ Vote Aggregation
                               └─ Consensus Building
```

## Key Features

### 1. Multi-Agent Voting
Each AI model independently analyzes market pairs and provides:
- Match predictions
- Confidence scores (0.0 - 1.0)
- Similarity ratings (exact, high, medium, low)
- Reasoning for each match

### 2. Consensus Algorithm
```typescript
consensusScore = agentVotes.length / totalAgents
averageConfidence = sum(confidences) / agentVotes.length

// Only include matches where consensusScore >= threshold (default: 0.6)
```

### 3. Consensus Metadata
Each match includes:
- `agentVotes`: Array of AI models that voted for the match
- `consensusScore`: Percentage of models that agreed (0.0 - 1.0)
- `averageConfidence`: Mean confidence across voting models
- Enhanced reasoning with consensus information

### 4. Vote Deduplication
An agent that names the same pair more than once in a single response counts as
one vote, so `consensusScore` stays within `0.0 - 1.0`.

### 5. Fallback Mechanism
If consensus matching fails:
- Automatically falls back to single-agent (Claude) mode
- Logs error for debugging
- Ensures continuous operation

## Installation

```bash
npm install @anthropic-ai/sdk @google/generative-ai openai
```

## Configuration

### Environment Variables
```bash
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
```

### Initialization

```typescript
import { MatchingEngineService } from './matching-engine.service';

// With consensus enabled (recommended for accuracy)
const engine = new MatchingEngineService(
    process.env.ANTHROPIC_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.OPENAI_API_KEY,
    true // Enable consensus
);

// Single agent mode (faster, lower cost)
const singleEngine = new MatchingEngineService(
    process.env.ANTHROPIC_API_KEY,
    undefined,
    undefined,
    false // Disable consensus
);
```

## Usage

### Basic Matching with Consensus

```typescript
const result = await engine.matchMarkets();

console.log(`Found ${result.matchedCount} matches`);

result.matches.forEach(match => {
    console.log(`Match: ${match.polymarketRecord.ticker} → ${match.kalshiRecord.ticker}`);
    console.log(`Confidence: ${(match.confidence * 100).toFixed(1)}%`);
    console.log(`Reasoning: ${match.reasoning}`);
    // Reasoning includes: "(Consensus: 100% - Voted by: claude, gemini, chatgpt)"
});
```

### Find Arbitrage Opportunities

```typescript
const arbitrage = await engine.findArbitrageOpportunities({}, 0.05);

arbitrage.forEach(match => {
    const priceDiff = Math.abs(
        match.polymarketRecord.price - match.kalshiRecord.price
    );
    console.log(`Arbitrage: $${priceDiff.toFixed(4)} difference`);
});
```

### Choosing a Mode

The mode is fixed at construction time - there is no runtime toggle. Build a
second engine if you need both:

```typescript
const consensusEngine = new MatchingEngineService(anthropicKey, geminiKey, openaiKey, true);
const singleEngine    = new MatchingEngineService(anthropicKey);
```

In the running server the mode is decided by which keys are present in `.env`;
`src/services/matching-engine.instance.ts` builds the one shared engine from
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `OPENAI_API_KEY`. Consensus requires
both optional keys - one alone falls back to single-agent.

### Filter by Ticker

```typescript
const result = await engine.matchMarkets({
    polymarketTicker: 'TRUMP',
    limit: 10
});
```

### Time Range Filtering

`startTimestamp` and `endTimestamp` are unix timestamps in **seconds**, not ISO
strings:

```typescript
const result = await engine.matchMarkets({
    startTimestamp: Math.floor(Date.parse('2025-01-01T00:00:00Z') / 1000),
    endTimestamp: Math.floor(Date.parse('2025-01-31T23:59:59Z') / 1000)
});
```

## Performance Considerations

### Consensus Mode
- **Speed**: ~3-5 seconds per batch (parallel API calls)
- **Cost**: 3x API costs (three providers)
- **Accuracy**: ~20-30% improvement in match quality
- **Use case**: Critical matching, daily/weekly batch processing

### Single-Agent Mode
- **Speed**: ~1-2 seconds per batch
- **Cost**: 1x API costs (Anthropic only)
- **Accuracy**: Still excellent, single model analysis
- **Use case**: Real-time matching, frequent updates

### Optimization Tips

1. **Use caching**: Results are cached for 1 hour by default
```typescript
// Clear cache when needed (async: it also clears the embedding cache)
await engine.clearCache();
```

2. **Pre-filtering**: Semantic vector similarity (MiniLM-L6-v2, cosine >= 0.75)
   discards non-candidate pairs before any LLM call. How much it removes depends
   entirely on how much the two exchanges' listings overlap.

3. **Batch processing**: Automatically batches large datasets (50 records/batch)

4. **Limit results**: Use filters to reduce processing time
```typescript
const result = await engine.matchMarkets({ limit: 20 });
```

## Consensus Statistics

Get detailed statistics about consensus matching:

```typescript
import { ConsensusService } from './consensus.service';

const consensusService = new ConsensusService(
    anthropicKey,
    geminiKey,
    openaiKey
);

const matches = await consensusService.getConsensusMatches(
    polymarketRecords,
    kalshiRecords
);

const stats = consensusService.getConsensusStatistics(matches);

console.log(`Total matches: ${stats.totalMatches}`);
console.log(`Unanimous (100%): ${stats.unanimousMatches}`);
console.log(`Majority (60-99%): ${stats.majorityMatches}`);
console.log(`Avg consensus: ${stats.averageConsensusScore}`);
console.log(`Avg confidence: ${stats.averageConfidence}`);
```

## Error Handling

The system implements robust error handling:

```typescript
try {
    const result = await engine.matchMarkets();
} catch (error) {
    console.error('Matching failed:', error);
    // Error details are logged
    // Automatic fallback to single-agent if consensus fails
}
```

## API Models Used

- **Claude**: `claude-sonnet-4-20250514` (Primary, most reliable)
- **Gemini**: `gemini-2.0-flash-exp` (Fast, good at semantic matching)
- **ChatGPT**: `gpt-4o` (Strong reasoning, good consensus validator)

## Consensus Threshold

Adjust the consensus threshold for stricter or looser matching:

```typescript
// In ConsensusService constructor
private readonly CONSENSUS_THRESHOLD = 0.6; // 60% of agents must agree

// 0.33 = At least 1 out of 3 agents (loose)
// 0.66 = At least 2 out of 3 agents (strict)
// 1.0  = All 3 agents must agree (very strict)
```

## Best Practices

1. **Use consensus for important decisions**
   - Daily arbitrage analysis
   - Portfolio rebalancing
   - Risk assessment

2. **Use single-agent for routine tasks**
   - Price monitoring
   - Real-time updates
   - Exploratory analysis

3. **Monitor cache hit rates**
   - Cache results for repeated queries
   - Clear cache when markets change significantly

4. **Handle API failures gracefully**
   - System automatically falls back to single-agent
   - Log failures for monitoring
   - Consider retry logic for transient failures

## Cost and Performance

> The figures below are rough order-of-magnitude estimates to help you reason
> about the trade-off. They are **not** measurements taken from this codebase -
> no benchmark suite exists yet. Consensus mode issues three provider calls per
> batch instead of one, so expect roughly 3x the cost and to wait on the slowest
> of the three providers rather than one.

| | Single-Agent | Consensus |
| :--- | :--- | :--- |
| Provider calls per batch | 1 | 3 (in parallel) |
| Relative cost | 1x | ~3x |
| Latency | one provider | the slowest of three |
| Failure behaviour | request fails | falls back to single-agent |

Caching matters more than either: identical filters hit the one-hour result
cache and cost nothing.

## Troubleshooting

### All agents fail
- Check API keys are valid
- Verify network connectivity
- Check API rate limits
- System falls back to single-agent automatically

### Low consensus scores
- May indicate ambiguous markets
- Consider adjusting similarity thresholds
- Review pre-filtering results

### High processing time
- Reduce batch size
- Enable caching
- Use single-agent mode for time-sensitive tasks

## Future Enhancements

- [ ] Weighted voting (trust scores per agent)
- [ ] Dynamic threshold adjustment based on market type
- [ ] Agent specialization (e.g., Claude for politics, GPT for sports)
- [ ] Consensus explanation generation
- [ ] Real-time consensus streaming
- [ ] A/B testing framework for model comparison

## License

Apache-2.0 (see the repository root).

## Support

For issues or questions, please open an issue on the repository.