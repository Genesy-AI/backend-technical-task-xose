import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderSelectionPipeline } from './ProviderSelectionPipeline';
import { RateLimitProviderFilter } from './filters/RateLimitProviderFilter';
import { UserTierProviderFilter } from './filters/UserTierProviderFilter';
import { EnabledProviderFilter } from './filters/EnabledProviderFilter';
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limit/InMemoryRateLimitStore';
import { ProviderConfig, UserTier } from '../models/ProviderConfig';
import { ProviderName } from '../value-objects/ProviderName';

/**
 * Integration tests for ProviderSelectionPipeline
 * 
 * These tests verify that the entire pipeline works correctly with real implementations:
 * - Real InMemoryRateLimitStore (no mocks)
 * - All filters working together
 * - Sorting by priority
 * - Real-world scenarios with multiple users and providers
 */
describe('ProviderSelectionPipeline - Integration Tests', () => {
    let rateLimitStore: InMemoryRateLimitStore;
    let pipeline: ProviderSelectionPipeline;

    const mockProviders: ProviderConfig[] = [
        {
            name: ProviderName.ASTRA_DIALER,
            enabled: true,
            priority: 10, // Highest priority - tried first
            rateLimit: { maxRequestsPerHour: 300 }, // 5 per minute
            minUserTier: UserTier.FREE,
        },
        {
            name: ProviderName.NIMBUS_LOOKUP,
            enabled: true,
            priority: 5, // Medium priority
            rateLimit: { maxRequestsPerHour: 600 }, // 10 per minute
            minUserTier: UserTier.BASIC,
        },
        {
            name: ProviderName.ORION_CONNECT,
            enabled: true,
            priority: 1, // Lowest priority - tried last
            rateLimit: { maxRequestsPerHour: 180 }, // 3 per minute
            minUserTier: UserTier.PREMIUM,
        },
    ];

    beforeEach(() => {
        rateLimitStore = new InMemoryRateLimitStore();

        pipeline = new ProviderSelectionPipeline();
        pipeline
            .addFilter(new EnabledProviderFilter())
            .addFilter(new UserTierProviderFilter())
            .addFilter(new RateLimitProviderFilter(rateLimitStore));
    });

    describe('Real-world scenario: Multiple users with different tiers', () => {
        it('should handle FREE tier user with rate limits correctly', async () => {
            const userId = 'free-user-1';
            const userTier = UserTier.FREE;

            // First request should get AstraDialer (priority 10, allowed for FREE)
            const result1 = await pipeline.execute(mockProviders, { userId, userTier });
            expect(result1).toHaveLength(1);
            expect(result1[0].name).toBe(ProviderName.ASTRA_DIALER);

            // Exhaust AstraDialer rate limit (300 requests per hour)
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) { // 300 calls to spend all the available rate limit
                await rateLimitStore.tryConsume(`provider:${ProviderName.ASTRA_DIALER}:${hour}`, 300, 3600);
            }

            // Next request should have no providers available (NimbusLookup and OrionConnect not allowed for FREE)
            const result2 = await pipeline.execute(mockProviders, { userId, userTier });
            expect(result2).toHaveLength(0);
        });

        it('should handle BASIC tier user with cascading to next provider', async () => {
            const userId = 'basic-user-1';
            const userTier = UserTier.BASIC;

            // First request should return [AstraDialer, NimbusLookup] (both allowed for BASIC)
            const result1 = await pipeline.execute(mockProviders, { userId, userTier });
            expect(result1).toHaveLength(2);
            expect(result1[0].name).toBe(ProviderName.ASTRA_DIALER);
            expect(result1[1].name).toBe(ProviderName.NIMBUS_LOOKUP);

            // Exhaust AstraDialer rate limit
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) {
                await rateLimitStore.tryConsume(`provider:${ProviderName.ASTRA_DIALER}:${hour}`, 300, 3600);
            }

            // Next request should only return NimbusLookup
            const result2 = await pipeline.execute(mockProviders, { userId, userTier });
            expect(result2).toHaveLength(1);
            expect(result2[0].name).toBe(ProviderName.NIMBUS_LOOKUP);
        });

        it('should handle PREMIUM tier user with access to all providers', async () => {
            const userId = 'premium-user-1';
            const userTier = UserTier.PREMIUM;

            // Premium user should get all 3 providers sorted by priority
            const result = await pipeline.execute(mockProviders, { userId, userTier });
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe(ProviderName.ASTRA_DIALER);
            expect(result[1].name).toBe(ProviderName.NIMBUS_LOOKUP);
            expect(result[2].name).toBe(ProviderName.ORION_CONNECT);
        });
    });

    describe('Shared rate limiting across users', () => {
        it('should affect all users when provider rate limit is exhausted', async () => {
            const user1 = 'user-1';
            const user2 = 'user-2';
            const userTier = UserTier.BASIC;

            // Exhaust AstraDialer rate limit (shared across all users)
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) {
                await rateLimitStore.tryConsume(`provider:${ProviderName.ASTRA_DIALER}:${hour}`, 300, 3600);
            }

            // User 1 should only get NimbusLookup (AstraDialer exhausted)
            const result1 = await pipeline.execute(mockProviders, { userId: user1, userTier });
            expect(result1).toHaveLength(1);
            expect(result1[0].name).toBe(ProviderName.NIMBUS_LOOKUP);

            // User 2 should ALSO only get NimbusLookup (rate limit is shared)
            const result2 = await pipeline.execute(mockProviders, { userId: user2, userTier });
            expect(result2).toHaveLength(1);
            expect(result2[0].name).toBe(ProviderName.NIMBUS_LOOKUP);
        });
    });

    describe('Disabled providers', () => {
        it('should exclude disabled providers even if user has access', async () => {
            const providersWithDisabled: ProviderConfig[] = [
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: false, // Disabled
                    priority: 1,
                    rateLimit: { maxRequestsPerHour: 300 },
                    minUserTier: UserTier.FREE,
                },
                {
                    name: ProviderName.NIMBUS_LOOKUP,
                    enabled: true,
                    priority: 2,
                    rateLimit: { maxRequestsPerHour: 600 },
                    minUserTier: UserTier.BASIC,
                },
            ];

            const result = await pipeline.execute(providersWithDisabled, { userId: 'user-1', userTier: UserTier.PREMIUM });

            // Only NimbusLookup should be returned (AstraDialer is disabled)
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.NIMBUS_LOOKUP);
        });

        it('should return empty array if all providers are disabled', async () => {
            const allDisabled: ProviderConfig[] = mockProviders.map((p) => ({
                ...p,
                enabled: false,
            }));

            const result = await pipeline.execute(allDisabled, { userId: 'user-1', userTier: UserTier.PREMIUM });
            expect(result).toHaveLength(0);
        });
    });

    describe('Complex scenario: Mixed conditions', () => {
        it('should handle user with partial access and some rate limits exhausted', async () => {
            const userId = 'complex-user';
            const userTier = UserTier.BASIC;

            // Exhaust AstraDialer rate limit
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) {
                await rateLimitStore.tryConsume(`provider:${ProviderName.ASTRA_DIALER}:${hour}`, 300, 3600);
            }

            // Add a disabled provider to the mix
            const complexProviders: ProviderConfig[] = [
                { ...mockProviders[0], enabled: false }, // AstraDialer disabled (and rate limited)
                mockProviders[1], // NimbusLookup enabled, allowed for BASIC
                mockProviders[2], // OrionConnect enabled, NOT allowed for BASIC
            ];

            // Should only return NimbusLookup (AstraDialer disabled, OrionConnect not allowed for BASIC)
            const result = await pipeline.execute(complexProviders, { userId, userTier });
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.NIMBUS_LOOKUP);
        });

        it('should handle concurrent requests from multiple users with shared rate limits', async () => {
            const userTier = UserTier.BASIC;

            // Simulate 10 concurrent users making requests
            const concurrentRequests = Array.from({ length: 10 }, (_, i) =>
                pipeline.execute(mockProviders, { userId: `user-${i}`, userTier })
            );

            const results = await Promise.all(concurrentRequests);

            // All users should get the same providers (rate limit shared but not exhausted)
            results.forEach((result) => {
                expect(result).toHaveLength(2);
                expect(result[0].name).toBe(ProviderName.ASTRA_DIALER);
                expect(result[1].name).toBe(ProviderName.NIMBUS_LOOKUP);
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle empty provider list', async () => {
            const result = await pipeline.execute([], { userId: 'user-1', userTier: UserTier.PREMIUM });
            expect(result).toHaveLength(0);
        });

        it('should handle provider with very low rate limit', async () => {
            const lowRateLimitProvider: ProviderConfig[] = [
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 1,
                    rateLimit: { maxRequestsPerHour: 1 }, // Only 1 request per hour
                    minUserTier: UserTier.FREE,
                },
            ];

            const userId = 'user-1';
            const userTier = UserTier.FREE;

            // First request should succeed
            const result1 = await pipeline.execute(lowRateLimitProvider, { userId, userTier });
            expect(result1).toHaveLength(1);

            // Consume the 1 allowed request
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            await rateLimitStore.tryConsume(`provider:${ProviderName.ASTRA_DIALER}:${hour}`, 1, 3600);

            // Second request should return empty (rate limit exhausted)
            const result2 = await pipeline.execute(lowRateLimitProvider, { userId, userTier });
            expect(result2).toHaveLength(0);
        });
    });
});
