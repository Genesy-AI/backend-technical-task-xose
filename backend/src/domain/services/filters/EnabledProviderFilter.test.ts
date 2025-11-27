import { describe, it, expect } from 'vitest';
import { EnabledProviderFilter } from './EnabledProviderFilter';
import { ProviderName } from '../../value-objects/ProviderName';
import { ProviderConfig } from '../../models/ProviderConfig';

describe('EnabledProviderFilter', () => {
    const filter = new EnabledProviderFilter();

    describe('filter()', () => {
        it('should only return enabled providers', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: false,
                    priority: 5,
                },
            ];

            const result = await filter.filter(providers, {});

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe(ProviderName.ORION_CONNECT);
        });

        it('should filter out all disabled providers', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: false,
                    priority: 10,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: false,
                    priority: 5,
                },
            ];

            const result = await filter.filter(providers, {});

            expect(result).toHaveLength(0);
        });

        it('should return all providers when all are enabled', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 5,
                },
                {
                    name: ProviderName.NIMBUS_LOOKUP,
                    enabled: true,
                    priority: 1,
                },
            ];

            const result = await filter.filter(providers, {});

            expect(result).toHaveLength(3);
            expect(result.map(p => p.name)).toEqual([
                ProviderName.ORION_CONNECT,
                ProviderName.ASTRA_DIALER,
                ProviderName.NIMBUS_LOOKUP,
            ]);
        });

        it('should handle empty providers array', async () => {
            const providers: ProviderConfig[] = [];

            const result = await filter.filter(providers, {});

            expect(result).toHaveLength(0);
        });

        it('should not modify the original array', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: false,
                    priority: 5,
                },
            ];

            const originalLength = providers.length;
            await filter.filter(providers, {});

            expect(providers).toHaveLength(originalLength);
        });

        it('should preserve all provider properties', async () => {
            const providers: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    rateLimit: { maxRequestsPerHour: 100 },
                },
            ];

            const result = await filter.filter(providers, {});

            expect(result[0]).toEqual(providers[0]);
            expect(result[0].priority).toBe(10);
            expect(result[0].rateLimit?.maxRequestsPerHour).toBe(100);
        });
    });
});
