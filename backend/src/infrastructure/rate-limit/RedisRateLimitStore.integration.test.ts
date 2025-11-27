import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisRateLimitStore } from './RedisRateLimitStore';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_KEY = 'test-rate-limit';

describe('RedisRateLimitStore [integration]', () => {
    let store: RedisRateLimitStore;

    beforeAll(async () => {
        store = new RedisRateLimitStore(REDIS_URL);
        await store.connect();
        await store.reset(TEST_KEY);
    });

    afterAll(async () => {
        await store.reset(TEST_KEY);
        await store.disconnect();
    });

    it('should allow requests under the limit', async () => {
        // Allow up to 5 requests per minute
        for (let i = 0; i < 5; i++) {
            const allowed = await store.tryConsume(TEST_KEY, 5, 60);
            expect(allowed).toBe(true);
        }
    });

    it('should block requests over the limit', async () => {
        // 6th request should be blocked
        const allowed = await store.tryConsume(TEST_KEY, 5, 60);
        expect(allowed).toBe(false);
    });

    it('should count requests correctly', async () => {
        const count = await store.getCount(TEST_KEY);
        expect(count).toBe(6); // 5 allowed + 1 blocked
    });

    it('should reset the key', async () => {
        await store.reset(TEST_KEY);
        const count = await store.getCount(TEST_KEY);
        expect(count).toBe(0);
    });
});
