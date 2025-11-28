import {
  ProviderSelectionPipeline,
  EnabledProviderFilter,
  UserTierProviderFilter,
  RateLimitProviderFilter,
} from '../../domain/services'
import { RateLimitStoreFactory } from '../../infrastructure/rate-limit'
import { PROVIDER_CONFIGS } from '../../config'

import { ProviderConfig } from '../../domain/models/ProviderConfig'
import { ProviderFilterContext } from '../../domain/services/IProviderFilter'

/**
 * Temporal activity to get available providers based on filters and context.
 */
export async function getAvailablePhoneProviders(
  filterContext: ProviderFilterContext
): Promise<ProviderConfig[]> {
  // Initialize rate limit store
  const rateLimitStore = await RateLimitStoreFactory.create({
    redisUrl: process.env.REDIS_URL,
  })

  // Build selection pipeline (same as in useCase, but without consumption)
  const pipeline = new ProviderSelectionPipeline()
  pipeline
    .addFilter(new EnabledProviderFilter())
    .addFilter(new UserTierProviderFilter())
    .addFilter(new RateLimitProviderFilter(rateLimitStore)) // This filters without consuming

  return await pipeline.execute(PROVIDER_CONFIGS, filterContext)
}
