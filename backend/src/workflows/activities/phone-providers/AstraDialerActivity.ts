import { PhoneSearchParams } from '../../../domain/ports/IPhoneProvider';
import { AstraDialerAdapter } from '../../../infrastructure/phone-providers/AstraDialerAdapter';
import { PROVIDER_API_CONFIG, PROVIDER_CONFIGS } from '../../../config';
import { ProviderName } from '../../../domain/value-objects/ProviderName';
import { RateLimitStoreFactory } from '../../../infrastructure/rate-limit';
import { RateLimitProviderFilter } from '../../../domain/services/filters/RateLimitProviderFilter';
import { PhoneResult } from '../../types/PhoneResult';

const provider = new AstraDialerAdapter(
    PROVIDER_API_CONFIG[ProviderName.ASTRA_DIALER].url,
    PROVIDER_API_CONFIG[ProviderName.ASTRA_DIALER].apiKey
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
 * Temporal activity for AstraDialer provider.
 */
export async function astraDialerFindPhone(params: PhoneSearchParams): Promise<PhoneResult | null> {
    const filter = await getRateLimitFilter();
    const config = PROVIDER_CONFIGS.find(c => c.name === ProviderName.ASTRA_DIALER);
    if (!config) {
        console.warn('AstraDialer config not found');
        return null;
    }

    const rateLimitAllowed = await filter.consumeRateLimit(config);
    if (!rateLimitAllowed) {
        console.warn('AstraDialer rate limit exceeded');
        return null;
    }

    try {
        const result = await provider.findPhone(params);
        if (result) {
            return {
                phone: result.phone,
                provider: ProviderName.ASTRA_DIALER,
                countryCode: result.countryCode,
            };
        }
        return null;
    } catch (error) {
        // Re-throw to retry the activity
        console.error("AsrtaDialer failed")
        throw error;
    }
}
