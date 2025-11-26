import { FindPhoneUseCase } from '../../application/usecases/findPhoneUseCase';
import { OrionConnectAdapter } from '../../infrastructure/phone-providers/OrionConnectAdapter';
import { AstraDialerAdapter } from '../../infrastructure/phone-providers/AstraDialerAdapter';
import { NimbusLookupAdapter } from '../../infrastructure/phone-providers/NimbusLookupAdapter';
import { ProviderName } from '../../domain/value-objects/ProviderName';
import { UserTier } from '../../domain/models/ProviderConfig';
import {
    ProviderSelectionPipeline,
    EnabledProviderFilter,
    UserTierProviderFilter,
    RateLimitProviderFilter,
} from '../../domain/services';
import { RateLimitStoreFactory } from '../../infrastructure/rate-limit';
import { PROVIDER_CONFIGS, PROVIDER_API_CONFIG } from '../../config';

// Lazy initialization of use case (created once, reused across activities)
let findPhoneUseCase: FindPhoneUseCase | null = null;

async function getOrCreateFindPhoneUseCase(): Promise<FindPhoneUseCase> {
    if (findPhoneUseCase) {
        return findPhoneUseCase;
    }

    // Initialize rate limit store
    const rateLimitStore = await RateLimitStoreFactory.create({
        redisUrl: process.env.REDIS_URL,
    });

    // Initialize provider adapters from configuration
    const providerMap = new Map();
    providerMap.set(
        ProviderName.ORION_CONNECT,
        new OrionConnectAdapter(
            PROVIDER_API_CONFIG[ProviderName.ORION_CONNECT].url,
            PROVIDER_API_CONFIG[ProviderName.ORION_CONNECT].apiKey
        )
    );
    providerMap.set(
        ProviderName.ASTRA_DIALER,
        new AstraDialerAdapter(
            PROVIDER_API_CONFIG[ProviderName.ASTRA_DIALER].url,
            PROVIDER_API_CONFIG[ProviderName.ASTRA_DIALER].apiKey
        )
    );
    providerMap.set(
        ProviderName.NIMBUS_LOOKUP,
        new NimbusLookupAdapter(
            PROVIDER_API_CONFIG[ProviderName.NIMBUS_LOOKUP].url,
            PROVIDER_API_CONFIG[ProviderName.NIMBUS_LOOKUP].apiKey
        )
    );

    // Build selection pipeline
    const pipeline = new ProviderSelectionPipeline();
    pipeline
        .addFilter(new EnabledProviderFilter())
        .addFilter(new UserTierProviderFilter())
        .addFilter(new RateLimitProviderFilter(rateLimitStore));

    // Create use case with rate limit filter reference for consumption
    findPhoneUseCase = new FindPhoneUseCase(
        providerMap,
        PROVIDER_CONFIGS,
        pipeline,
        new RateLimitProviderFilter(rateLimitStore) // Pass filter for rate limit consumption
    );

    return findPhoneUseCase;
}

export interface FindPhoneParams {
    email?: string;
    fullName?: string;
    companyWebsite?: string;
    jobTitle?: string;
    userTier?: UserTier;
}

export interface FindPhoneResult {
    phone: string;
    provider: string;
    countryCode?: string;
}

/**
 * Temporal activity for finding a phone number using the waterfall pattern.
 *
 * @param params - Search parameters and user context
 * @returns Phone result or null if not found
 */
export async function findPhone(params: FindPhoneParams): Promise<FindPhoneResult | null> {
    const useCase = await getOrCreateFindPhoneUseCase();

    const result = await useCase.execute(
        {
            email: params.email,
            fullName: params.fullName,
            companyWebsite: params.companyWebsite,
            jobTitle: params.jobTitle,
        },
        {
            userTier: params.userTier ?? UserTier.FREE,
        }
    );

    return result;
}
