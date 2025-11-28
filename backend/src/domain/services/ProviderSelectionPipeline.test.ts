import { describe, it, expect, beforeEach } from 'vitest'
import { ProviderSelectionPipeline } from './ProviderSelectionPipeline'
import { EnabledProviderFilter } from './filters/EnabledProviderFilter'
import { UserTierProviderFilter } from './filters/UserTierProviderFilter'
import { RateLimitProviderFilter } from './filters/RateLimitProviderFilter'
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limit/InMemoryRateLimitStore'
import { ProviderName } from '../value-objects/ProviderName'
import { ProviderConfig, UserTier } from '../models/ProviderConfig'

describe('ProviderSelectionPipeline', () => {
  let pipeline: ProviderSelectionPipeline

  beforeEach(() => {
    pipeline = new ProviderSelectionPipeline()
  })

  describe('execute() with single filter', () => {
    it('should apply enabled filter', async () => {
      pipeline.addFilter(new EnabledProviderFilter())

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
      ]

      const result = await pipeline.execute(providers, {})

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe(ProviderName.ORION_CONNECT)
    })

    it('should apply user tier filter', async () => {
      pipeline.addFilter(new UserTierProviderFilter())

      const providers: ProviderConfig[] = [
        {
          name: ProviderName.ORION_CONNECT,
          enabled: true,
          priority: 10,
          minUserTier: UserTier.PREMIUM,
        },
        {
          name: ProviderName.ASTRA_DIALER,
          enabled: true,
          priority: 5,
        },
      ]

      const result = await pipeline.execute(providers, { userTier: UserTier.FREE })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe(ProviderName.ASTRA_DIALER)
    })
  })

  describe('execute() with multiple filters', () => {
    it('should apply all filters in sequence', async () => {
      pipeline.addFilter(new EnabledProviderFilter()).addFilter(new UserTierProviderFilter())

      const providers: ProviderConfig[] = [
        {
          name: ProviderName.ORION_CONNECT,
          enabled: true,
          priority: 10,
          minUserTier: UserTier.PREMIUM,
        },
        {
          name: ProviderName.ASTRA_DIALER,
          enabled: false,
          priority: 5,
        },
        {
          name: ProviderName.NIMBUS_LOOKUP,
          enabled: true,
          priority: 1,
        },
      ]

      const result = await pipeline.execute(providers, { userTier: UserTier.FREE })

      // Orion: filtered by tier
      // Astra: filtered by enabled
      // Nimbus: passes all filters
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe(ProviderName.NIMBUS_LOOKUP)
    })

    it('should apply filters with rate limiting', async () => {
      const store = new InMemoryRateLimitStore()
      const rateLimitFilter = new RateLimitProviderFilter(store)

      pipeline
        .addFilter(new EnabledProviderFilter())
        .addFilter(new UserTierProviderFilter())
        .addFilter(rateLimitFilter)

      const providers: ProviderConfig[] = [
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
      ]

      // Consume Orion's rate limit
      await rateLimitFilter.consumeRateLimit(providers[0])

      const result = await pipeline.execute(providers, {})

      // Orion should be filtered by rate limit
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe(ProviderName.ASTRA_DIALER)
    })

    it('should return empty array when all providers filtered', async () => {
      pipeline.addFilter(new EnabledProviderFilter()).addFilter(new UserTierProviderFilter())

      const providers: ProviderConfig[] = [
        {
          name: ProviderName.ORION_CONNECT,
          enabled: false,
          priority: 10,
        },
        {
          name: ProviderName.ASTRA_DIALER,
          enabled: true,
          priority: 5,
          minUserTier: UserTier.PREMIUM,
        },
      ]

      const result = await pipeline.execute(providers, { userTier: UserTier.FREE })

      expect(result).toHaveLength(0)
    })
  })

  describe('execute() with sorting', () => {
    it('should sort by priority after filtering', async () => {
      pipeline.addFilter(new EnabledProviderFilter())

      const providers: ProviderConfig[] = [
        {
          name: ProviderName.NIMBUS_LOOKUP,
          enabled: true,
          priority: 1,
        },
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
      ]

      const result = await pipeline.execute(providers, {})

      expect(result).toHaveLength(3)
      expect(result[0].name).toBe(ProviderName.ORION_CONNECT) // priority 10
      expect(result[1].name).toBe(ProviderName.ASTRA_DIALER) // priority 5
      expect(result[2].name).toBe(ProviderName.NIMBUS_LOOKUP) // priority 1
    })

    it('should sort remaining providers after multiple filters', async () => {
      pipeline.addFilter(new EnabledProviderFilter()).addFilter(new UserTierProviderFilter())

      const providers: ProviderConfig[] = [
        {
          name: ProviderName.NIMBUS_LOOKUP,
          enabled: true,
          priority: 5,
        },
        {
          name: ProviderName.ORION_CONNECT,
          enabled: true,
          priority: 10,
          minUserTier: UserTier.PREMIUM, // Will be filtered for FREE tier
        },
        {
          name: ProviderName.ASTRA_DIALER,
          enabled: true,
          priority: 8,
        },
      ]

      const result = await pipeline.execute(providers, { userTier: UserTier.FREE })

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe(ProviderName.ASTRA_DIALER) // priority 8
      expect(result[1].name).toBe(ProviderName.NIMBUS_LOOKUP) // priority 5
    })
  })

  describe('execute() with no filters', () => {
    it('should only sort when no filters added', async () => {
      const providers: ProviderConfig[] = [
        {
          name: ProviderName.NIMBUS_LOOKUP,
          enabled: true,
          priority: 1,
        },
        {
          name: ProviderName.ORION_CONNECT,
          enabled: true,
          priority: 10,
        },
      ]

      const result = await pipeline.execute(providers, {})

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe(ProviderName.ORION_CONNECT)
      expect(result[1].name).toBe(ProviderName.NIMBUS_LOOKUP)
    })
  })

  describe('execute() with empty providers', () => {
    it('should return empty array', async () => {
      pipeline.addFilter(new EnabledProviderFilter())

      const result = await pipeline.execute([], {})

      expect(result).toHaveLength(0)
    })
  })

  describe('addFilter() chaining', () => {
    it('should support method chaining', () => {
      const result = pipeline.addFilter(new EnabledProviderFilter()).addFilter(new UserTierProviderFilter())

      expect(result).toBe(pipeline)
    })
  })
})
