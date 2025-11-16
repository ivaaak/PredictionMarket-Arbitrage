/**
 * Text processing utility for market matching
 * Handles tokenization, normalization, and similarity calculations
 */
export class TextProcessor {
    private readonly stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'be', 'been', 'will',
        'this', 'that', 'these', 'those', 'it', 'its'
    ]);

    private readonly datePatterns = [
        /\b\d{4}\b/g, // Years
        /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // Dates
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, // Months
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
        /\bq[1-4]\b/gi, // Quarters
        /\b(winter|spring|summer|fall|autumn)\b/gi // Seasons
    ];

    /**
     * Normalize text for comparison
     * - Convert to lowercase
     * - Remove special characters
     * - Normalize whitespace
     * - Remove common noise words
     */
    normalize(text: string): string {
        let normalized = text.toLowerCase();
        
        // Remove special characters but keep spaces and alphanumeric
        normalized = normalized.replace(/[^\w\s-]/g, ' ');
        
        // Normalize whitespace
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        return normalized;
    }

    /**
     * Tokenize text into meaningful terms
     * - Split into words
     * - Remove stop words
     * - Extract key entities (dates, numbers, keywords)
     */
    tokenize(text: string): string[] {
        const normalized = this.normalize(text);
        
        // Split into words
        let words = normalized.split(/\s+/);
        
        // Remove stop words
        words = words.filter(word => 
            word.length > 2 && !this.stopWords.has(word)
        );
        
        // Extract special entities
        const tokens = new Set<string>(words);
        
        // Extract dates/time references
        this.datePatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                matches.forEach(match => tokens.add(match.toLowerCase()));
            }
        });
        
        // Extract numbers (including those within words)
        const numbers = text.match(/\d+/g);
        if (numbers) {
            numbers.forEach(num => tokens.add(num));
        }
        
        // Extract camelCase and PascalCase as separate tokens
        const camelCaseWords = text.match(/[A-Z][a-z]+/g);
        if (camelCaseWords) {
            camelCaseWords.forEach(word => tokens.add(word.toLowerCase()));
        }
        
        return Array.from(tokens);
    }

    /**
     * Calculate similarity between two sets of tokens using Jaccard similarity
     * Returns a value between 0 and 1
     */
    calculateTokenSimilarity(tokens1: string[], tokens2: string[]): number {
        if (tokens1.length === 0 && tokens2.length === 0) return 0;
        if (tokens1.length === 0 || tokens2.length === 0) return 0;
        
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        
        // Calculate intersection
        const intersection = new Set(
            [...set1].filter(token => set2.has(token))
        );
        
        // Calculate union
        const union = new Set([...set1, ...set2]);
        
        // Jaccard similarity: |A ∩ B| / |A ∪ B|
        return intersection.size / union.size;
    }

    /**
     * Calculate weighted similarity considering token importance
     * Gives higher weight to rare/specific terms
     */
    calculateWeightedSimilarity(
        tokens1: string[],
        tokens2: string[],
        corpusFrequency: Map<string, number>
    ): number {
        if (tokens1.length === 0 || tokens2.length === 0) return 0;
        
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        
        let weightedIntersection = 0;
        let weightedUnion = 0;
        
        const allTokens = new Set([...tokens1, ...tokens2]);
        
        allTokens.forEach(token => {
            // Inverse document frequency as weight (rare terms are more important)
            const frequency = corpusFrequency.get(token) || 1;
            const weight = Math.log(1 + (1 / frequency));
            
            if (set1.has(token) && set2.has(token)) {
                weightedIntersection += weight;
            }
            weightedUnion += weight;
        });
        
        return weightedUnion > 0 ? weightedIntersection / weightedUnion : 0;
    }

    /**
     * Extract key phrases (n-grams) from text
     */
    extractKeyPhrases(text: string, n: number = 2): string[] {
        const normalized = this.normalize(text);
        const words = normalized.split(/\s+/).filter(w => w.length > 2);
        
        const phrases: string[] = [];
        
        for (let i = 0; i <= words.length - n; i++) {
            const phrase = words.slice(i, i + n).join(' ');
            phrases.push(phrase);
        }
        
        return phrases;
    }

    /**
     * Calculate string similarity using Levenshtein distance
     */
    calculateLevenshteinSimilarity(str1: string, str2: string): number {
        const len1 = str1.length;
        const len2 = str2.length;
        
        if (len1 === 0 || len2 === 0) return 0;
        
        const matrix: number[][] = [];
        
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        
        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        
        return 1 - (distance / maxLen);
    }

    /**
     * Build a corpus frequency map for weighted similarity
     */
    buildCorpusFrequency(texts: string[]): Map<string, number> {
        const frequency = new Map<string, number>();
        
        texts.forEach(text => {
            const tokens = this.tokenize(text);
            const uniqueTokens = new Set(tokens);
            
            uniqueTokens.forEach(token => {
                frequency.set(token, (frequency.get(token) || 0) + 1);
            });
        });
        
        return frequency;
    }

    /**
     * Extract event type from market text
     * Common patterns: elections, sports, economics, entertainment
     */
    extractEventType(text: string): string {
        const lower = text.toLowerCase();
        
        if (lower.match(/\b(election|vote|president|senator|congress|parliament)\b/)) {
            return 'politics';
        }
        if (lower.match(/\b(nba|nfl|mlb|nhl|soccer|football|basketball|championship|playoff)\b/)) {
            return 'sports';
        }
        if (lower.match(/\b(gdp|inflation|fed|interest rate|stock|market|economy)\b/)) {
            return 'economics';
        }
        if (lower.match(/\b(movie|oscar|emmy|grammy|box office|album)\b/)) {
            return 'entertainment';
        }
        if (lower.match(/\b(weather|temperature|hurricane|storm|climate)\b/)) {
            return 'weather';
        }
        if (lower.match(/\b(bitcoin|crypto|ethereum|blockchain)\b/)) {
            return 'crypto';
        }
        
        return 'general';
    }

    /**
     * Compare two market tickers and return detailed similarity metrics
     */
    compareMarkets(ticker1: string, ticker2: string): {
        tokenSimilarity: number;
        stringSimilarity: number;
        eventType1: string;
        eventType2: string;
        sameEventType: boolean;
        overallScore: number;
    } {
        const tokens1 = this.tokenize(ticker1);
        const tokens2 = this.tokenize(ticker2);
        
        const tokenSimilarity = this.calculateTokenSimilarity(tokens1, tokens2);
        const stringSimilarity = this.calculateLevenshteinSimilarity(
            this.normalize(ticker1),
            this.normalize(ticker2)
        );
        
        const eventType1 = this.extractEventType(ticker1);
        const eventType2 = this.extractEventType(ticker2);
        const sameEventType = eventType1 === eventType2;
        
        // Calculate overall score with weights
        const overallScore = (
            tokenSimilarity * 0.5 +
            stringSimilarity * 0.3 +
            (sameEventType ? 0.2 : 0)
        );
        
        return {
            tokenSimilarity,
            stringSimilarity,
            eventType1,
            eventType2,
            sameEventType,
            overallScore
        };
    }
}