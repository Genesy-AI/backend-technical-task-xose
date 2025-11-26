import Redis from 'ioredis';
import { IRateLimitStore } from './IRateLimitStore';

/**
 * Redis-based rate limit store using sliding window algorithm.
 * Suitable for distributed systems with multiple workers.
 */
export class RedisRateLimitStore implements IRateLimitStore {
    private client: Redis;

    constructor(redisUrl: string) {
        this.client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
                // Retry with exponential backoff, max 3 seconds
                return Math.min(times * 100, 3000);
            },
            lazyConnect: true,
        });

        // Handle connection errors gracefully
        this.client.on('error', (err) => {
            console.error('Redis connection error:', err.message);
        });

        this.client.on('connect', () => {
            console.log('Redis connected successfully');
        });
    }

    async connect(): Promise<void> {
        try {
            await this.client.connect();
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
            throw error;
        }
    }

    /**
     * Sliding window rate limiting using Redis ZSET (sorted set).
     * Stores timestamps of requests and removes old ones outside the window.
     */
    async tryConsume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
        const now = Date.now();
        const windowStart = now - windowSeconds * 1000;

        try {
            // Start Redis transaction
            const pipeline = this.client.pipeline();

            // Remove old entries outside the window
            pipeline.zremrangebyscore(key, 0, windowStart);

            // Count current entries in the window
            pipeline.zcard(key);

            // Add current request timestamp
            pipeline.zadd(key, now, `${now}`);

            // Set expiration to window duration (cleanup)
            pipeline.expire(key, windowSeconds);

            const results = await pipeline.exec();

            if (!results) {
                throw new Error('Redis pipeline execution failed');
            }

            // Get count from ZCARD result (index 1)
            const countResult = results[1];
            if (countResult[0]) {
                throw countResult[0]; // Error in ZCARD command
            }

            const currentCount = countResult[1] as number;

            // Check if under limit (count before adding current request)
            return currentCount < limit;
        } catch (error) {
            console.error('Redis tryConsume error:', error);
            // On error, allow the request (fail open)
            return true;
        }
    }

    async getCount(key: string): Promise<number> {
        try {
            return await this.client.zcard(key);
        } catch (error) {
            console.error('Redis getCount error:', error);
            return 0;
        }
    }

    async reset(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch (error) {
            console.error('Redis reset error:', error);
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.client.quit();
        } catch (error) {
            console.error('Redis disconnect error:', error);
        }
    }
}
