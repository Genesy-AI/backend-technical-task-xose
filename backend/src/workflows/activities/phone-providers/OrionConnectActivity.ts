import { PhoneSearchParams, PhoneProviderResult } from '../../../domain/ports/IPhoneProvider';
import { OrionConnectAdapter } from '../../../infrastructure/phone-providers/OrionConnectAdapter';
import { PROVIDER_API_CONFIG, PROVIDER_CONFIGS } from '../../../config';
import { ProviderName } from '../../../domain/value-objects/ProviderName';
import { RateLimitStoreFactory } from '../../../infrastructure/rate-limit';
import { RateLimitProviderFilter } from '../../../domain/services/filters/RateLimitProviderFilter';
import { PhoneResult } from '../../types/PhoneResult';

const provider = new OrionConnectAdapter(
    PROVIDER_API_CONFIG[ProviderName.ORION_CONNECT].url,
    PROVIDER_API_CONFIG[ProviderName.ORION_CONNECT].apiKey
);

let rateLimitStore: any = null;
let rateLimitFilter: RateLimitProviderFilter | null = null;

async function getRateLimitFilter(): Promise<RateLimitProviderFilter> {
    if (!rateLimitFilter) {
        rateLimitStore = await RateLimitStoreFactory.create({
            redisUrl: process.env.REDIS_URL,
        });
        rateLimitFilter = new RateLimitProviderFilter(rateLimitStore);
    }
    return rateLimitFilter;
}

/**
 * Temporal activity for OrionConnect provider.
 */
export async function orionConnectFindPhone(params: PhoneSearchParams): Promise<PhoneResult | null> {
    const filter = await getRateLimitFilter();
    const config = PROVIDER_CONFIGS.find(c => c.name === ProviderName.ORION_CONNECT);
    if (!config) {
        console.warn('OrionConnect config not found');
        return null;
    }

    const rateLimitAllowed = await filter.consumeRateLimit(config);
    if (!rateLimitAllowed) {
        console.warn('OrionConnect rate limit exceeded');
        return null;
    }

    try {
        const result = await provider.findPhone(params);
        if (result) {
            return {
                phone: result.phone,
                provider: ProviderName.ORION_CONNECT,
                countryCode: result.countryCode,
            };
        }
        return null;
    } catch (error) {
        // Re-throw to retry the activity
        console.error("Orion Connect failed")
        throw error;
    }
}
