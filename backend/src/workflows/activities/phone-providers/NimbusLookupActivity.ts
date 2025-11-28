import { PhoneSearchParams, PhoneProviderResult } from '../../../domain/ports/IPhoneProvider'
import { NimbusLookupAdapter } from '../../../infrastructure/phone-providers/NimbusLookupAdapter'
import { PROVIDER_API_CONFIG, PROVIDER_CONFIGS } from '../../../config'
import { ProviderName } from '../../../domain/value-objects/ProviderName'
import { RateLimitStoreFactory } from '../../../infrastructure/rate-limit'
import { RateLimitProviderFilter } from '../../../domain/services/filters/RateLimitProviderFilter'
import { PhoneResult } from '../../types/PhoneResult'

const provider = new NimbusLookupAdapter(
  PROVIDER_API_CONFIG[ProviderName.NIMBUS_LOOKUP].url,
  PROVIDER_API_CONFIG[ProviderName.NIMBUS_LOOKUP].apiKey
)

let rateLimitStore: any = null
let rateLimitFilter: RateLimitProviderFilter | null = null

async function getRateLimitFilter(): Promise<RateLimitProviderFilter> {
  if (!rateLimitFilter) {
    rateLimitStore = await RateLimitStoreFactory.create({
      redisUrl: process.env.REDIS_URL,
    })
    rateLimitFilter = new RateLimitProviderFilter(rateLimitStore)
  }
  return rateLimitFilter
}

/**
 * Temporal activity for NimbusLookup provider.
 */
export async function nimbusLookupFindPhone(params: PhoneSearchParams): Promise<PhoneResult | null> {
  const filter = await getRateLimitFilter()
  const config = PROVIDER_CONFIGS.find((c) => c.name === ProviderName.NIMBUS_LOOKUP)
  if (!config) {
    console.warn('NimbusLookup config not found')
    return null
  }

  const rateLimitAllowed = await filter.consumeRateLimit(config)
  if (!rateLimitAllowed) {
    console.warn('NimbusLookup rate limit exceeded')
    return null
  }

  try {
    const result = await provider.findPhone(params)
    if (result) {
      return {
        phone: result.phone,
        provider: ProviderName.NIMBUS_LOOKUP,
        countryCode: result.countryCode,
      }
    }
    return null
  } catch (error) {
    // Re-throw to retry the activity
    console.error('NimbusLookup failed')
    throw error
  }
}
