import { MatchingResult } from '../types/matchingResult';
import { MatchFilters } from '../types/matchFilters';
import crypto from 'crypto';
import chalk from 'chalk';

interface CacheEntry {
    data: MatchingResult;
    timestamp: number;
    expiresAt: number;
}

/**
 * Cache for storing matching results to avoid redundant AI calls
 */
export class MatchCache {
    private cache: Map<string, CacheEntry>;
    private ttlMs: number;
    private maxEntries: number;
    private cleanupIntervalMs: number;
    private cleanupTimer?: NodeJS.Timeout;

    constructor(ttlMs: number = 3600000, maxEntries: number = 1000) {
        this.cache = new Map();
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.cleanupIntervalMs = 300000; // Clean up every 5 minutes

        this.startCleanupTimer();
    }

    /**
     * Generate a unique cache key from filters
     */
    generateKey(filters: MatchFilters): string {
        // Create a deterministic string from filters
        const filterString = JSON.stringify({
            startTimestamp: filters.startTimestamp || null,
            endTimestamp: filters.endTimestamp || null,
            polymarketTicker: filters.polymarketTicker || null,
            kalshiTicker: filters.kalshiTicker || null,
            limit: filters.limit || null
        });

        // Hash it for a shorter key
        return crypto.createHash('sha256').update(filterString).digest('hex');
    }

    /**
     * Get a cached result if it exists and is not expired
     */
    get(key: string): MatchingResult | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        // Update access time for LRU behavior
        entry.timestamp = Date.now();

        console.log(chalk.green.bold('[CACHE]'), chalk.cyan(`Cache hit for key: ${key.substring(0, 8)}...`));
        return entry.data;
    }

    /**
     * Store a result in the cache
     */
    set(key: string, data: MatchingResult): void {
        // Enforce max entries (simple LRU eviction)
        if (this.cache.size >= this.maxEntries) {
            this.evictOldest();
        }

        const entry: CacheEntry = {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + this.ttlMs
        };

        this.cache.set(key, entry);
        console.log(chalk.green.bold('[CACHE]'), chalk.cyan(`Cached result for key: ${key.substring(0, 8)}... (${this.cache.size}/${this.maxEntries} entries)`));
    }

    /**
     * Evict the oldest cache entry
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        this.cache.forEach((entry, key) => {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        });

        if (oldestKey) {
            this.cache.delete(oldestKey);
            console.log(chalk.green.bold('[CACHE]'), chalk.yellow(`Evicted oldest entry: ${(oldestKey as string).substring(0, 8)}...`));
        }
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        console.log(chalk.green.bold('[CACHE]'), chalk.yellow('Cache cleared'));
    }

    /**
     * Remove expired entries
     */
    private cleanupExpired(): void {
        const now = Date.now();
        let expiredCount = 0;

        this.cache.forEach((entry, key) => {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                expiredCount++;
            }
        });

        if (expiredCount > 0) {
            console.log(chalk.green.bold('[CACHE]'), chalk.gray(`Cleaned up ${expiredCount} expired entries. Current size: ${this.cache.size}`));
        }
    }

    /**
     * Start periodic cleanup timer
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.cleanupIntervalMs);
    }

    /**
     * Stop cleanup timer (call on shutdown)
     */
    stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxEntries: number;
        ttlMs: number;
        oldestEntryAge: number | null;
        newestEntryAge: number | null;
    } {
        const now = Date.now();
        let oldestTime: number | null = null;
        let newestTime: number | null = null;

        this.cache.forEach(entry => {
            if (oldestTime === null || entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
            }
            if (newestTime === null || entry.timestamp > newestTime) {
                newestTime = entry.timestamp;
            }
        });

        return {
            size: this.cache.size,
            maxEntries: this.maxEntries,
            ttlMs: this.ttlMs,
            oldestEntryAge: oldestTime ? now - oldestTime : null,
            newestEntryAge: newestTime ? now - newestTime : null
        };
    }

    /**
     * Invalidate cache entries matching specific criteria
     */
    invalidate(filters: Partial<MatchFilters>): number {
        let invalidatedCount = 0;

        this.cache.forEach((_, key) => {
            // If filters match, invalidate
            // This is a simple implementation; could be enhanced
            this.cache.delete(key);
            invalidatedCount++;
        });

        console.log(chalk.green.bold('[CACHE]'), chalk.yellow(`Invalidated ${invalidatedCount} entries`));
        return invalidatedCount;
    }
}