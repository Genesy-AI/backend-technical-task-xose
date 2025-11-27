import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryRateLimitStore } from './InMemoryRateLimitStore';

describe('InMemoryRateLimitStore', () => {
    let store: InMemoryRateLimitStore;

    beforeEach(() => {
        store = new InMemoryRateLimitStore();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('tryConsume()', () => {
        it('should return true when under limit', async () => {
            const result = await store.tryConsume('test-key', 10, 3600);

            expect(result).toBe(true);
        });

        it('should return false when limit exceeded', async () => {
            const key = 'test-key';
            const limit = 2;

            await store.tryConsume(key, limit, 3600);
            await store.tryConsume(key, limit, 3600);
            const result = await store.tryConsume(key, limit, 3600);

            expect(result).toBe(false);
        });

        it('should track multiple keys independently', async () => {
            const key1 = 'provider-1';
            const key2 = 'provider-2';
            const limit = 1;

            await store.tryConsume(key1, limit, 3600);
            const result1 = await store.tryConsume(key1, limit, 3600);
            const result2 = await store.tryConsume(key2, limit, 3600);

            expect(result1).toBe(false); // key1 exhausted
            expect(result2).toBe(true);  // key2 still available
        });

        it('should use sliding window (remove old entries)', async () => {
            const key = 'test-key';
            const limit = 2;
            const windowSeconds = 10;

            // First request at T=0
            vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
            await store.tryConsume(key, limit, windowSeconds);

            // Second request at T=0
            await store.tryConsume(key, limit, windowSeconds);

            // Third request at T=0 should fail (limit=2)
            const result1 = await store.tryConsume(key, limit, windowSeconds);
            expect(result1).toBe(false);

            // Advance time by 11 seconds (outside window)
            vi.setSystemTime(new Date('2025-01-01T00:00:11Z'));

            // Fourth request at T=11 should succeed (old entries removed)
            const result2 = await store.tryConsume(key, limit, windowSeconds);
            expect(result2).toBe(true);
        });

        it('should handle concurrent requests correctly', async () => {
            const key = 'test-key';
            const limit = 5;

            const results = await Promise.all([
                store.tryConsume(key, limit, 3600),
                store.tryConsume(key, limit, 3600),
                store.tryConsume(key, limit, 3600),
                store.tryConsume(key, limit, 3600),
                store.tryConsume(key, limit, 3600),
                store.tryConsume(key, limit, 3600), // 6th should fail
            ]);

            const successCount = results.filter(r => r === true).length;
            const failCount = results.filter(r => r === false).length;

            expect(successCount).toBe(5);
            expect(failCount).toBe(1);
        });
    });

    describe('getCount()', () => {
        it('should return 0 for non-existent key', async () => {
            const count = await store.getCount('non-existent');

            expect(count).toBe(0);
        });

        it('should return correct count after consumptions', async () => {
            const key = 'test-key';

            await store.tryConsume(key, 10, 3600);
            await store.tryConsume(key, 10, 3600);
            await store.tryConsume(key, 10, 3600);

            const count = await store.getCount(key);

            expect(count).toBe(3);
        });

        it('should exclude entries outside sliding window', async () => {
            const key = 'test-key';
            const windowSeconds = 10;

            vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
            await store.tryConsume(key, 10, windowSeconds);
            await store.tryConsume(key, 10, windowSeconds);

            vi.setSystemTime(new Date('2025-01-01T00:00:11Z'));
            await store.tryConsume(key, 10, windowSeconds);

            const count = await store.getCount(key);

            // Only the last entry should count (first two are outside window)
            expect(count).toBe(1);
        });

        it('should not modify the store', async () => {
            const key = 'test-key';

            await store.tryConsume(key, 10, 3600);
            const count1 = await store.getCount(key);
            const count2 = await store.getCount(key);

            expect(count1).toBe(count2);
            expect(count1).toBe(1);
        });
    });

    describe('reset()', () => {
        it('should clear all entries for a key', async () => {
            const key = 'test-key';

            await store.tryConsume(key, 10, 3600);
            await store.tryConsume(key, 10, 3600);
            await store.reset(key);

            const count = await store.getCount(key);

            expect(count).toBe(0);
        });

        it('should allow consumption after reset', async () => {
            const key = 'test-key';
            const limit = 2;

            await store.tryConsume(key, limit, 3600);
            await store.tryConsume(key, limit, 3600);
            await store.reset(key);

            const result = await store.tryConsume(key, limit, 3600);

            expect(result).toBe(true);
        });

        it('should only reset specified key', async () => {
            const key1 = 'provider-1';
            const key2 = 'provider-2';

            await store.tryConsume(key1, 10, 3600);
            await store.tryConsume(key2, 10, 3600);
            await store.reset(key1);

            const count1 = await store.getCount(key1);
            const count2 = await store.getCount(key2);

            expect(count1).toBe(0);
            expect(count2).toBe(1);
        });

        it('should handle reset of non-existent key', async () => {
            await expect(store.reset('non-existent')).resolves.not.toThrow();
        });
    });

    describe('disconnect()', () => {
        it('should resolve without error', async () => {
            await expect(store.disconnect()).resolves.toBeUndefined();
        });

        it('should not affect store functionality', async () => {
            await store.disconnect();

            const result = await store.tryConsume('test-key', 10, 3600);

            expect(result).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle very small time windows', async () => {
            const key = 'test-key';
            const limit = 2;
            const windowSeconds = 1;

            vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
            await store.tryConsume(key, limit, windowSeconds);

            vi.setSystemTime(new Date('2025-01-01T00:00:01.001Z'));
            const result = await store.tryConsume(key, limit, windowSeconds);

            // Old entry should be outside window
            expect(result).toBe(true);
        });

        it('should handle very large limits', async () => {
            const key = 'test-key';
            const limit = 1000000;

            const result = await store.tryConsume(key, limit, 3600);

            expect(result).toBe(true);
        });

        it('should handle limit of 1', async () => {
            const key = 'test-key';
            const limit = 1;

            const result1 = await store.tryConsume(key, limit, 3600);
            const result2 = await store.tryConsume(key, limit, 3600);

            expect(result1).toBe(true);
            expect(result2).toBe(false);
        });
    });
});
