import { describe, it, expect } from 'vitest';
import { UserTierProviderFilter } from './UserTierProviderFilter';
import { ProviderName } from '../../value-objects/ProviderName';
import { ProviderConfig, UserTier } from '../../models/ProviderConfig';

describe('UserTierProviderFilter', () => {
    const filter = new UserTierProviderFilter();

    describe('filter() with user tiers', () => {
        it('should allow providers for matching user tier', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    minUserTier: UserTier.BASIC,
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.BASIC });

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.ORION_CONNECT);
        });

        it('should filter out providers above user tier', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    minUserTier: UserTier.PREMIUM,
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.FREE });

            expect(result).toHaveLength(0);
        });

        it('should allow providers without tier requirement', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 5,
                    // No minUserTier - available to all
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.FREE });

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.ASTRA_DIALER);
        });

        it('should allow higher tier users to access lower tier providers', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.NIMBUS_LOOKUP,
                    enabled: true,
                    priority: 5,
                    minUserTier: UserTier.BASIC,
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.PREMIUM });

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.NIMBUS_LOOKUP);
        });

        it('should handle multiple providers with different tier requirements', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    minUserTier: UserTier.PREMIUM,
                },
                {
                    name: ProviderName.NIMBUS_LOOKUP,
                    enabled: true,
                    priority: 5,
                    minUserTier: UserTier.BASIC,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 1,
                    // No tier requirement
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.BASIC });

            // BASIC user should only see Nimbus (BASIC) and Astra (no requirement)
            expect(result).toHaveLength(2);
            expect(result.find(p => p.name === ProviderName.ORION_CONNECT)).toBeUndefined();
            expect(result.find(p => p.name === ProviderName.NIMBUS_LOOKUP)).toBeDefined();
            expect(result.find(p => p.name === ProviderName.ASTRA_DIALER)).toBeDefined();
        });

        it('should allow PREMIUM users to access all providers', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    minUserTier: UserTier.PREMIUM,
                },
                {
                    name: ProviderName.NIMBUS_LOOKUP,
                    enabled: true,
                    priority: 5,
                    minUserTier: UserTier.BASIC,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 1,
                    // No tier requirement
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.PREMIUM });

            expect(result).toHaveLength(3);
        });

        it('should default to FREE tier when userTier not provided', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    minUserTier: UserTier.BASIC,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 5,
                    // No tier requirement
                },
            ];

            const result = await filter.filter(providers, {});

            // Should behave like FREE tier - only Astra available
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.ASTRA_DIALER);
        });

        it('should return empty array when no providers match tier', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    minUserTier: UserTier.PREMIUM,
                },
                {
                    name: ProviderName.NIMBUS_LOOKUP,
                    enabled: true,
                    priority: 5,
                    minUserTier: UserTier.BASIC,
                },
            ];

            const result = await filter.filter(providers, { userTier: UserTier.FREE });

            expect(result).toHaveLength(0);
        });
    });
});
