import { IPhoneProvider, PhoneSearchParams } from '../../domain/ports/IPhoneProvider';
import { ProviderConfig } from '../../domain/models/ProviderConfig';
import { ProviderSelectionPipeline, ProviderFilterContext } from '../../domain/services';
import { RateLimitProviderFilter } from '../../domain/services/filters/RateLimitProviderFilter';

export interface PhoneResult {
    phone: string;
    provider: string;
    countryCode?: string;
}

/**
 * Use case for finding a phone number using multiple providers.
 * Implements waterfall pattern with provider selection pipeline.
 *
 * Flow:
 * 1. Get available providers using selection pipeline (filters + priority sorting)
 * 2. Try each provider in order until a phone is found
 * 3. Consume rate limit ONLY when provider is actually used
 * 4. Return result or null if no provider succeeds
 */
export class FindPhoneUseCase {
    constructor(
        private readonly providerMap: Map<string, IPhoneProvider>,
        private readonly providerConfigs: ProviderConfig[],
        private readonly selectionPipeline: ProviderSelectionPipeline,
        private readonly rateLimitFilter?: RateLimitProviderFilter
    ) { }

    async execute(
        params: PhoneSearchParams,
        filterContext: ProviderFilterContext = {}
    ): Promise<PhoneResult | null> {
        // Get available providers (filtered and sorted by priority)
        const availableConfigs = await this.selectionPipeline.execute(this.providerConfigs, filterContext);

        if (availableConfigs.length === 0) {
            console.warn('No providers available after filtering');
            return null;
        }

        // Waterfall pattern: try each provider in priority order until a phone is found
        for (const config of availableConfigs) {
            const provider = this.providerMap.get(config.name);

            if (!provider) {
                console.warn(`Provider ${config.name} not found in provider map`);
                continue;
            }

            // Consume rate limit BEFORE attempting to use the provider
            if (this.rateLimitFilter) {
                const rateLimitAllowed = await this.rateLimitFilter.consumeRateLimit(config);
                if (!rateLimitAllowed) {
                    console.warn(`Provider ${config.name} rate limit exceeded at consumption time`);
                    continue; // Skip this provider, try next one
                }
            }

            try {
                const result = await provider.findPhone(params);

                if (result) {
                    return {
                        phone: result.phone,
                        provider: provider.name,
                        countryCode: result.countryCode,
                    };
                }

                // If result is null, continue with next provider
            } catch (error) {
                // If provider fails (network error, API down, etc.), log and continue
                console.error(`Provider ${provider.name} failed:`, error);
                // Continue with next provider
            }
        }

        // No provider found a phone number
        return null;
    }
}