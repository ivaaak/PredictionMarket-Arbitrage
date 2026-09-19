// src/services/vector-matching.service.ts
import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import chalk from 'chalk';

export class VectorMatchingService {
    // The in-flight (or settled) initialisation is memoised rather than the
    // instance itself: caching the instance eagerly hands concurrent callers a
    // service whose model has not finished loading, and a failed load would
    // leave a permanently broken singleton behind.
    private static initPromise: Promise<VectorMatchingService> | null = null;

    private extractor: FeatureExtractionPipeline | null = null;

    // In-memory cache for embeddings to avoid re-computing (saves CPU)
    private embeddingCache: Map<string, number[]> = new Map();

    private constructor() {}

    public static async getInstance(): Promise<VectorMatchingService> {
        if (!VectorMatchingService.initPromise) {
            const service = new VectorMatchingService();
            VectorMatchingService.initPromise = service
                .initialize()
                .then(() => service)
                .catch((error) => {
                    // Drop the memo so a later request can retry the download.
                    VectorMatchingService.initPromise = null;
                    throw error;
                });
        }
        return VectorMatchingService.initPromise;
    }

    private async initialize() {
        console.log(chalk.magenta.bold('[VECTOR-MATCH]'), chalk.cyan('Loading embedding model (all-MiniLM-L6-v2)...'));
        // This downloads the model locally (~80MB) on first run
        this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log(chalk.magenta.bold('[VECTOR-MATCH]'), chalk.green('Model loaded.'));
    }

    /**
     * Generate a vector embedding for a given text
     */
    public async getEmbedding(text: string): Promise<number[]> {
        if (!this.extractor) throw new Error('Model not initialized');

        // Check cache
        if (this.embeddingCache.has(text)) {
            return this.embeddingCache.get(text)!;
        }

        // Generate embedding
        // Pooling 'mean' gives us a single vector for the whole sentence
        const output = await this.extractor(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data) as number[]; // Convert Float32Array to number[]
        
        // Cache it
        this.embeddingCache.set(text, embedding);
        
        return embedding;
    }

    /**
     * Generate embeddings for a batch of texts.
     *
     * Duplicate texts are only embedded once, and the model calls are issued
     * together rather than one-per-comparison, which keeps the pre-filter at
     * O(n + m) embeddings instead of O(n * m) awaits.
     */
    public async getEmbeddings(texts: string[]): Promise<number[][]> {
        const unique = Array.from(new Set(texts));
        const missing = unique.filter(t => !this.embeddingCache.has(t));

        await Promise.all(missing.map(t => this.getEmbedding(t)));

        return texts.map(t => this.embeddingCache.get(t)!);
    }

    /**
     * Calculate Cosine Similarity between two vectors
     * Returns value -1 to 1 (1 means identical direction/meaning)
     */
    public calculateSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) return 0;

        let dotProduct = 0;
        // Since vectors are normalized by the model, we strictly only need dot product
        // But for safety against un-normalized inputs, we can do full cosine sim
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
        }
        
        return dotProduct;
    }

    /**
     * Find best matches for a Polymarket item against a list of Kalshi candidates
     */
    public async findMatches(
        polyMarket: { ticker: string; title: string },
        kalshiMarkets: { index: number; ticker: string; title: string }[],
        threshold: number = 0.75
    ): Promise<number[]> { // Returns indices of Kalshi markets
        
        const polyEmbedding = await this.getEmbedding(polyMarket.title);
        const matches: number[] = [];

        for (const kMarket of kalshiMarkets) {
            const kEmbedding = await this.getEmbedding(kMarket.title);
            const score = this.calculateSimilarity(polyEmbedding, kEmbedding);

            if (score >= threshold) {
                matches.push(kMarket.index);
            }
        }

        return matches;
    }
    
    // Optional: Clear cache to free memory
    public clearCache() {
        this.embeddingCache.clear();
    }
}