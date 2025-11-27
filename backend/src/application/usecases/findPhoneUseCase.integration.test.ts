import { describe, it, expect, beforeEach } from 'vitest';
import { FindPhoneUseCase } from './findPhoneUseCase';
import { IPhoneProvider, PhoneProviderResult, PhoneSearchParams } from '../../domain/ports/IPhoneProvider';
import { ProviderConfig, UserTier } from '../../domain/models/ProviderConfig';
import { ProviderSelectionPipeline } from '../../domain/services/ProviderSelectionPipeline';
import { RateLimitProviderFilter } from '../../domain/services/filters/RateLimitProviderFilter';
import { UserTierProviderFilter } from '../../domain/services/filters/UserTierProviderFilter';
import { EnabledProviderFilter } from '../../domain/services/filters/EnabledProviderFilter';
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limit/InMemoryRateLimitStore';
import { ProviderName } from '../../domain/value-objects/ProviderName';

/**
 * Integration tests for FindPhoneUseCase
 * 
 * These tests verify the entire phone lookup flow with real implementations:
 * - Real ProviderSelectionPipeline with all filters
 * - Real InMemoryRateLimitStore (no mocks)
 * - Fake phone providers (in-memory)
 * - Complete waterfall pattern behavior
 * - Rate limit consumption on actual usage
 */
describe('FindPhoneUseCase - Integration Tests', () => {
    let rateLimitStore: InMemoryRateLimitStore;
    let rateLimitFilter: RateLimitProviderFilter;
    let pipeline: ProviderSelectionPipeline;
    let useCase: FindPhoneUseCase;
    let providerMap: Map<string, IPhoneProvider>;
    let providerConfigs: ProviderConfig[];

    // Fake phone providers for testing
    class FakeAstraDialer implements IPhoneProvider {
        name = ProviderName.ASTRA_DIALER;
        async findPhone(params: PhoneSearchParams) {
            if (params.fullName === 'John Doe') {
                return { phone: '+1234567890', countryCode: 'US' };
            }
            return null;
        }
    }

    class FakeNimbusLookup implements IPhoneProvider {
        name = ProviderName.NIMBUS_LOOKUP;
        async findPhone(params: PhoneSearchParams) {
            if (params.fullName === 'Jane Smith') {
                return { phone: '+9876543210', countryCode: 'UK' };
            }
            return null;
        }
    }

    class FakeOrionConnect implements IPhoneProvider {
        name = ProviderName.ORION_CONNECT;
        async findPhone(params: PhoneSearchParams) {
            if (params.fullName === 'Bob Johnson') {
                return { phone: '+1111111111', countryCode: 'CA' };
            }
            return null;
        }
    }

    class FailingProvider implements IPhoneProvider {
        name = 'FailingProvider' as ProviderName;
        async findPhone(): Promise<PhoneProviderResult | null> {
            throw new Error('Provider API is down');
        }
    }

    beforeEach(() => {
        rateLimitStore = new InMemoryRateLimitStore();

        rateLimitFilter = new RateLimitProviderFilter(rateLimitStore);

        pipeline = new ProviderSelectionPipeline();
        pipeline
            .addFilter(new EnabledProviderFilter())
            .addFilter(new UserTierProviderFilter())
            .addFilter(rateLimitFilter);

        providerConfigs = [
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

        providerMap = new Map([
            [ProviderName.ASTRA_DIALER, new FakeAstraDialer()],
            [ProviderName.NIMBUS_LOOKUP, new FakeNimbusLookup()],
            [ProviderName.ORION_CONNECT, new FakeOrionConnect()],
        ]);

        useCase = new FindPhoneUseCase(providerMap, providerConfigs, pipeline, rateLimitFilter);
    });

    describe('Waterfall pattern with real providers', () => {
        it('should find phone using first available provider', async () => {
            const result = await useCase.execute(
                { fullName: 'John Doe', email: 'john@example.com' },
                { userId: 'user-1', userTier: UserTier.FREE }
            );

            expect(result).toEqual({
                phone: '+1234567890',
                provider: ProviderName.ASTRA_DIALER,
                countryCode: 'US',
            });
        });

        it('should cascade to second provider when first provider has no result', async () => {
            const result = await useCase.execute(
                { fullName: 'Jane Smith', email: 'jane@example.com' },
                { userId: 'user-1', userTier: UserTier.BASIC }
            );

            expect(result).toEqual({
                phone: '+9876543210',
                provider: ProviderName.NIMBUS_LOOKUP,
                countryCode: 'UK',
            });
        });

        it('should cascade to third provider when first two have no result', async () => {
            const result = await useCase.execute(
                { fullName: 'Bob Johnson', email: 'bob@example.com' },
                { userId: 'user-1', userTier: UserTier.PREMIUM }
            );

            expect(result).toEqual({
                phone: '+1111111111',
                provider: ProviderName.ORION_CONNECT,
                countryCode: 'CA',
            });
        });

        it('should return null when no provider has result', async () => {
            const result = await useCase.execute(
                { fullName: 'Unknown Person', email: 'unknown@example.com' },
                { userId: 'user-1', userTier: UserTier.PREMIUM }
            );

            expect(result).toBeNull();
        });
    });

    describe('Rate limiting integration', () => {
        it('should consume rate limit when provider is used', async () => {
            const userId = 'user-1';
            const userTier = UserTier.FREE;

            // First request
            await useCase.execute(
                { fullName: 'John Doe', email: 'john@example.com' },
                { userId, userTier }
            );

            // Check usage count (should be 1)
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            const count = await rateLimitStore.getCount(
                `provider:${ProviderName.ASTRA_DIALER}:${hour}`
            );
            expect(count).toBe(1);
        });

        it('should skip provider when rate limit is exhausted and use next available', async () => {
            const userId = 'user-1';
            const userTier = UserTier.BASIC;

            // Exhaust AstraDialer rate limit
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) {
                await rateLimitStore.tryConsume(
                    `provider:${ProviderName.ASTRA_DIALER}:${hour}`,
                    300,
                    3600
                );
            }

            // Request should cascade to NimbusLookup (second provider)
            const result = await useCase.execute(
                { fullName: 'Jane Smith', email: 'jane@example.com' },
                { userId, userTier }
            );

            expect(result).toEqual({
                phone: '+9876543210',
                provider: ProviderName.NIMBUS_LOOKUP,
                countryCode: 'UK',
            });

            // Verify NimbusLookup rate limit was consumed
            const nimbusCount = await rateLimitStore.getCount(
                `provider:${ProviderName.NIMBUS_LOOKUP}:${hour}`
            );
            expect(nimbusCount).toBe(1);

            // Verify AstraDialer was NOT consumed again (still at 300)
            const astraCount = await rateLimitStore.getCount(
                `provider:${ProviderName.ASTRA_DIALER}:${hour}`
            );
            expect(astraCount).toBe(300);
        });

        it('should return null when all providers are rate limited', async () => {
            const userId = 'user-1';
            const userTier = UserTier.BASIC;

            // Exhaust both AstraDialer and NimbusLookup rate limits
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) {
                await rateLimitStore.tryConsume(
                    `provider:${ProviderName.ASTRA_DIALER}:${hour}`,
                    300,
                    3600
                );
            }
            for (let i = 0; i < 600; i++) {
                await rateLimitStore.tryConsume(
                    `provider:${ProviderName.NIMBUS_LOOKUP}:${hour}`,
                    600,
                    3600
                );
            }

            const result = await useCase.execute(
                { fullName: 'John Doe', email: 'john@example.com' },
                { userId, userTier }
            );

            expect(result).toBeNull();
        });
    });

    describe('Error handling with real pipeline', () => {
        it('should cascade to next provider when one fails with error', async () => {
            // Replace AstraDialer with failing provider
            providerMap.set(ProviderName.ASTRA_DIALER, new FailingProvider() as any);

            const result = await useCase.execute(
                { fullName: 'Jane Smith', email: 'jane@example.com' },
                { userId: 'user-1', userTier: UserTier.BASIC }
            );

            // Should still get result from NimbusLookup (second provider)
            expect(result).toEqual({
                phone: '+9876543210',
                provider: ProviderName.NIMBUS_LOOKUP,
                countryCode: 'UK',
            });
        });

        it('should return null when no providers are available due to tier restrictions', async () => {
            const result = await useCase.execute(
                { fullName: 'Bob Johnson', email: 'bob@example.com' },
                { userId: 'user-1', userTier: UserTier.FREE } // FREE tier has no access to OrionConnect
            );

            // OrionConnect is only available for PREMIUM, and FREE tier can't access it
            expect(result).toBeNull();
        });
    });

    describe('Multi-user concurrent access', () => {
        it('should share rate limits across all users (provider-level rate limiting)', async () => {
            const users = ['user-1', 'user-2', 'user-3'];
            const userTier = UserTier.BASIC;

            // All users make requests concurrently - they share the same rate limit
            const requests = users.map((userId) =>
                useCase.execute(
                    { fullName: 'John Doe', email: 'john@example.com' },
                    { userId, userTier }
                )
            );

            const results = await Promise.all(requests);

            // All should get results (rate limit shared but not exhausted yet)
            results.forEach((result) => {
                expect(result).toEqual({
                    phone: '+1234567890',
                    provider: ProviderName.ASTRA_DIALER,
                    countryCode: 'US',
                });
            });

            // Verify rate limit count is 3 (one per user request)
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            const count = await rateLimitStore.getCount(
                `provider:${ProviderName.ASTRA_DIALER}:${hour}`
            );
            expect(count).toBe(3);
        });

        it('should affect all users when provider rate limit is exhausted', async () => {
            const user1 = 'heavy-user';
            const user2 = 'normal-user';
            const userTier = UserTier.BASIC;

            // Exhaust AstraDialer rate limit (300 requests per hour)
            const now = new Date();
            const hour = now.toISOString().slice(0, 13);
            for (let i = 0; i < 300; i++) {
                await rateLimitStore.tryConsume(
                    `provider:${ProviderName.ASTRA_DIALER}:${hour}`,
                    300,
                    3600
                );
            }

            // Both users should cascade to NimbusLookup (AstraDialer exhausted for everyone)
            const result1 = await useCase.execute(
                { fullName: 'Jane Smith', email: 'jane@example.com' },
                { userId: user1, userTier }
            );
            expect(result1?.provider).toBe(ProviderName.NIMBUS_LOOKUP);

            const result2 = await useCase.execute(
                { fullName: 'Jane Smith', email: 'jane@example.com' },
                { userId: user2, userTier }
            );
            expect(result2?.provider).toBe(ProviderName.NIMBUS_LOOKUP);
        });
    });
});
