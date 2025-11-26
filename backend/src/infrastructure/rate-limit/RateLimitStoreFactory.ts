import { IRateLimitStore } from './IRateLimitStore';
import { RedisRateLimitStore } from './RedisRateLimitStore';
import { InMemoryRateLimitStore } from './InMemoryRateLimitStore';

export interface RateLimitStoreConfig {
    redisUrl?: string;
    forceInMemory?: boolean;
}

/**
 * Factory for creating rate limit store instances.
 * Automatically detects Redis availability and falls back to in-memory.
 */
export class RateLimitStoreFactory {
    /**
     * Creates a rate limit store instance.
     * 
     * Strategy:
     * 1. If forceInMemory is true → InMemoryRateLimitStore
     * 2. If redisUrl is provided → Try RedisRateLimitStore, fallback to InMemoryRateLimitStore on error
     * 3. Otherwise → InMemoryRateLimitStore
     */
    static async create(config: RateLimitStoreConfig = {}): Promise<IRateLimitStore> {
        // Force in-memory mode (useful for tests)
        if (config.forceInMemory) {
            console.log('Using InMemoryRateLimitStore (forced)');
            return new InMemoryRateLimitStore();
        }

        // Try Redis if URL provided
        if (config.redisUrl) {
            try {
                const redisStore = new RedisRateLimitStore(config.redisUrl);
                await redisStore.connect();
                console.log('Using RedisRateLimitStore (distributed rate limiting enabled)');
                return redisStore;
            } catch (error) {
                console.warn(
                    'Failed to connect to Redis, falling back to InMemoryRateLimitStore:',
                    error instanceof Error ? error.message : error
                );
            }
        }

        // Default to in-memory
        console.log('Using InMemoryRateLimitStore (single-worker mode)');
        return new InMemoryRateLimitStore();
    }
}
