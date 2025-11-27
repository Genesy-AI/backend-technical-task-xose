import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FindPhoneUseCase } from './findPhoneUseCase';
import { IPhoneProvider } from '../../domain/ports/IPhoneProvider';
import { ProviderName } from '../../domain/value-objects/ProviderName';
import { ProviderConfig, UserTier } from '../../domain/models/ProviderConfig';
import { ProviderSelectionPipeline } from '../../domain/services/ProviderSelectionPipeline';
import { EnabledProviderFilter } from '../../domain/services/filters/EnabledProviderFilter';
import { RateLimitProviderFilter } from '../../domain/services/filters/RateLimitProviderFilter';
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limit/InMemoryRateLimitStore';

describe('FindPhoneUseCase', () => {
    let mockOrionProvider: IPhoneProvider;
    let mockAstraProvider: IPhoneProvider;
    let mockNimbusProvider: IPhoneProvider;
    let providerMap: Map<string, IPhoneProvider>;
    let configs: ProviderConfig[];
    let pipeline: ProviderSelectionPipeline;

    beforeEach(() => {
        // Create mock providers
        mockOrionProvider = {
            name: ProviderName.ORION_CONNECT,
            findPhone: vi.fn(),
        };

        mockAstraProvider = {
            name: ProviderName.ASTRA_DIALER,
            findPhone: vi.fn(),
        };

        mockNimbusProvider = {
            name: ProviderName.NIMBUS_LOOKUP,
            findPhone: vi.fn(),
        };

        // Setup provider map
        providerMap = new Map([
            [ProviderName.ORION_CONNECT, mockOrionProvider],
            [ProviderName.ASTRA_DIALER, mockAstraProvider],
            [ProviderName.NIMBUS_LOOKUP, mockNimbusProvider],
        ]);

        // Setup configs
        configs = [
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

        // Setup pipeline
        pipeline = new ProviderSelectionPipeline();
        pipeline.addFilter(new EnabledProviderFilter());
    });

    describe('execute() - waterfall pattern', () => {
        it('should return result from first successful provider', async () => {
            const useCase = new FindPhoneUseCase(providerMap, configs, pipeline);

            vi.mocked(mockOrionProvider.findPhone).mockResolvedValue({
                phone: '+1234567890',
            });

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toEqual({
                phone: '+1234567890',
                provider: ProviderName.ORION_CONNECT,
                countryCode: undefined,
            });
            expect(mockOrionProvider.findPhone).toHaveBeenCalledOnce();
            expect(mockAstraProvider.findPhone).not.toHaveBeenCalled();
            expect(mockNimbusProvider.findPhone).not.toHaveBeenCalled();
        });

        it('should try next provider if first returns null', async () => {
            const useCase = new FindPhoneUseCase(providerMap, configs, pipeline);

            vi.mocked(mockOrionProvider.findPhone).mockResolvedValue(null);
            vi.mocked(mockAstraProvider.findPhone).mockResolvedValue({
                phone: '+0987654321',
            });

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toEqual({
                phone: '+0987654321',
                provider: ProviderName.ASTRA_DIALER,
                countryCode: undefined,
            });
            expect(mockOrionProvider.findPhone).toHaveBeenCalledOnce();
            expect(mockAstraProvider.findPhone).toHaveBeenCalledOnce();
            expect(mockNimbusProvider.findPhone).not.toHaveBeenCalled();
        });

        it('should try next provider if first throws error', async () => {
            const useCase = new FindPhoneUseCase(providerMap, configs, pipeline);

            vi.mocked(mockOrionProvider.findPhone).mockRejectedValue(new Error('API Error'));
            vi.mocked(mockAstraProvider.findPhone).mockResolvedValue({
                phone: '+0987654321',
            });

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toEqual({
                phone: '+0987654321',
                provider: ProviderName.ASTRA_DIALER,
                countryCode: undefined,
            });
            expect(mockOrionProvider.findPhone).toHaveBeenCalledOnce();
            expect(mockAstraProvider.findPhone).toHaveBeenCalledOnce();
        });

        it('should return null if all providers fail', async () => {
            const useCase = new FindPhoneUseCase(providerMap, configs, pipeline);

            vi.mocked(mockOrionProvider.findPhone).mockResolvedValue(null);
            vi.mocked(mockAstraProvider.findPhone).mockResolvedValue(null);
            vi.mocked(mockNimbusProvider.findPhone).mockResolvedValue(null);

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toBeNull();
            expect(mockOrionProvider.findPhone).toHaveBeenCalledOnce();
            expect(mockAstraProvider.findPhone).toHaveBeenCalledOnce();
            expect(mockNimbusProvider.findPhone).toHaveBeenCalledOnce();
        });

        it('should return null if all providers throw errors', async () => {
            const useCase = new FindPhoneUseCase(providerMap, configs, pipeline);

            vi.mocked(mockOrionProvider.findPhone).mockRejectedValue(new Error('Orion Error'));
            vi.mocked(mockAstraProvider.findPhone).mockRejectedValue(new Error('Astra Error'));
            vi.mocked(mockNimbusProvider.findPhone).mockRejectedValue(new Error('Nimbus Error'));

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toBeNull();
        });

        it('should include countryCode when provider returns it', async () => {
            const useCase = new FindPhoneUseCase(providerMap, configs, pipeline);

            vi.mocked(mockNimbusProvider.findPhone).mockResolvedValue({
                phone: '+34123456789',
                countryCode: 'ES',
            });

            // Make Orion and Astra fail so Nimbus is used
            vi.mocked(mockOrionProvider.findPhone).mockResolvedValue(null);
            vi.mocked(mockAstraProvider.findPhone).mockResolvedValue(null);

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toEqual({
                phone: '+34123456789',
                provider: ProviderName.NIMBUS_LOOKUP,
                countryCode: 'ES',
            });
        });
    });

    describe('execute() - with rate limiting', () => {
        it('should consume rate limit only for provider that is used', async () => {
            const store = new InMemoryRateLimitStore();
            const rateLimitFilter = new RateLimitProviderFilter(store);

            const configsWithRateLimit: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    rateLimit: { maxRequestsPerHour: 100 },
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 5,
                    rateLimit: { maxRequestsPerHour: 100 },
                },
            ];

            const useCase = new FindPhoneUseCase(
                providerMap,
                configsWithRateLimit,
                pipeline,
                rateLimitFilter
            );

            vi.mocked(mockOrionProvider.findPhone).mockResolvedValue({
                phone: '+1234567890',
            });

            await useCase.execute({ email: 'test@example.com' });

            // Check that only Orion's rate limit was consumed
            const orionKey = `provider:${ProviderName.ORION_CONNECT}:${new Date().toISOString().slice(0, 13)}`;
            const astraKey = `provider:${ProviderName.ASTRA_DIALER}:${new Date().toISOString().slice(0, 13)}`;

            const orionCount = await store.getCount(orionKey);
            const astraCount = await store.getCount(astraKey);

            expect(orionCount).toBe(1);
            expect(astraCount).toBe(0);
        });

        it('should skip provider if rate limit exceeded at consumption time', async () => {
            const store = new InMemoryRateLimitStore();
            const rateLimitFilter = new RateLimitProviderFilter(store);

            const configsWithRateLimit: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: true,
                    priority: 10,
                    rateLimit: { maxRequestsPerHour: 1 },
                },
                {
                    name: ProviderName.ASTRA_DIALER,
                    enabled: true,
                    priority: 5,
                },
            ];

            pipeline.addFilter(rateLimitFilter);

            const useCase = new FindPhoneUseCase(
                providerMap,
                configsWithRateLimit,
                pipeline,
                rateLimitFilter
            );

            // Consume Orion's rate limit
            await rateLimitFilter.consumeRateLimit(configsWithRateLimit[0]);

            vi.mocked(mockAstraProvider.findPhone).mockResolvedValue({
                phone: '+0987654321',
            });

            const result = await useCase.execute({ email: 'test@example.com' });

            // Should use Astra because Orion is rate limited
            expect(result?.provider).toBe(ProviderName.ASTRA_DIALER);
            expect(mockOrionProvider.findPhone).not.toHaveBeenCalled();
            expect(mockAstraProvider.findPhone).toHaveBeenCalledOnce();
        });
    });

    describe('execute() - with no available providers', () => {
        it('should return null when no providers available after filtering', async () => {
            const disabledConfigs: ProviderConfig[] = [
                {
                    name: ProviderName.ORION_CONNECT,
                    enabled: false,
                    priority: 10,
                },
            ];

            const useCase = new FindPhoneUseCase(providerMap, disabledConfigs, pipeline);

            const result = await useCase.execute({ email: 'test@example.com' });

            expect(result).toBeNull();
            expect(mockOrionProvider.findPhone).not.toHaveBeenCalled();
        });
    });

    describe('execute() - with missing provider in map', () => {
        it('should skip provider if not found in provider map', async () => {
            const incompleteProviderMap = new Map([
                [ProviderName.ASTRA_DIALER, mockAstraProvider],
            ]);

            const useCase = new FindPhoneUseCase(incompleteProviderMap, configs, pipeline);

            vi.mocked(mockAstraProvider.findPhone).mockResolvedValue({
                phone: '+0987654321',
            });

            const result = await useCase.execute({ email: 'test@example.com' });

            // Should skip Orion (not in map) and use Astra
            expect(result?.provider).toBe(ProviderName.ASTRA_DIALER);
            expect(mockAstraProvider.findPhone).toHaveBeenCalledOnce();
        });
    });
});
