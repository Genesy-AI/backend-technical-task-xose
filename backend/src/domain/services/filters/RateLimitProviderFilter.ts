import { IProviderFilter, ProviderFilterContext } from '../IProviderFilter';
import { ProviderConfig } from '../../models/ProviderConfig';
import { IRateLimitStore } from '../../../infrastructure/rate-limit/IRateLimitStore';

/**
 * Filter that checks if providers are within their rate limits.
 * DOES NOT consume rate limit slots - only checks availability.
 * Actual consumption happens when the provider is used.
 */
export class RateLimitProviderFilter implements IProviderFilter {
    constructor(private rateLimitStore: IRateLimitStore) { }

    async filter(providers: ProviderConfig[], _context: ProviderFilterContext): Promise<ProviderConfig[]> {
        const now = new Date();
        const hour = now.toISOString().slice(0, 13); // Format: "2025-11-26T14"

        const availableProviders: ProviderConfig[] = [];

        for (const provider of providers) {
            // If no rate limit configured, provider is always available
            if (!provider.rateLimit) {
                availableProviders.push(provider);
                continue;
            }

            // Check rate limit without consuming
            const key = `provider:${provider.name}:${hour}`;
            const currentCount = await this.rateLimitStore.getCount(key);
            const limit = provider.rateLimit.maxRequestsPerHour;

            if (currentCount < limit) {
                availableProviders.push(provider);
            }
        }

        return availableProviders;
    }

    /**
     * Consumes a rate limit slot for a specific provider.
     * Should be called when the provider is actually used.
     */
    async consumeRateLimit(provider: ProviderConfig): Promise<boolean> {
        if (!provider.rateLimit) {
            return true; // No rate limit, always allowed
        }

        const now = new Date();
        const hour = now.toISOString().slice(0, 13);
        const key = `provider:${provider.name}:${hour}`;
        const limit = provider.rateLimit.maxRequestsPerHour;
        const windowSeconds = 3600; // 1 hour

        return await this.rateLimitStore.tryConsume(key, limit, windowSeconds);
    }
}
