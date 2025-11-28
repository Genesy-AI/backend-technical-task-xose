import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimitProviderFilter } from './RateLimitProviderFilter'
import { InMemoryRateLimitStore } from '../../../infrastructure/rate-limit/InMemoryRateLimitStore'
import { ProviderName } from '../../value-objects/ProviderName'
import { ProviderConfig } from '../../models/ProviderConfig'

describe('RateLimitProviderFilter', () => {
  let store: InMemoryRateLimitStore
  let filter: RateLimitProviderFilter

  beforeEach(() => {
    store = new InMemoryRateLimitStore()
    filter = new RateLimitProviderFilter(store)
  })

  describe('filter()', () => {
    it('should allow providers under rate limit', async () => {
      const providers: ProviderConfig[] = [
        {
          name: ProviderName.ORION_CONNECT,
          enabled: true,
          priority: 10,
          rateLimit: { maxRequestsPerHour: 100 },
        },
      ]

      const result = await filter.filter(providers, {})

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe(ProviderName.ORION_CONNECT)
    })

    it('should filter out providers over rate limit', async () => {
      const providers: ProviderConfig[] = [
        {
          name: ProviderName.ORION_CONNECT,
          enabled: true,
          priority: 10,
          rateLimit: { maxRequestsPerHour: 2 },
        },
      ]

      // Consume rate limit completely
      await filter.consumeRateLimit(providers[0])
      await filter.consumeRateLimit(providers[0])

      // Should be filtered out now
      const result = await filter.filter(providers, {})

      expect(result).toHaveLength(0)
    })

    it('should allow providers without rate limit config', async () => {
      const providers: ProviderConfig[] = [
        {
          name: ProviderName.ASTRA_DIALER,
          enabled: true,
          priority: 5,
          // No rateLimit configured
        },
      ]

      const result = await filter.filter(providers, {})

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe(ProviderName.ASTRA_DIALER)
    })

    it('should handle multiple providers with mixed rate limits', async () => {
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
          rateLimit: { maxRequestsPerHour: 100 },
        },
        {
          name: ProviderName.NIMBUS_LOOKUP,
          enabled: true,
          priority: 1,
          // No rate limit
        },
      ]

      // Consume Orion's limit
      await filter.consumeRateLimit(providers[0])

      const result = await filter.filter(providers, {})

      // Orion should be filtered out, Astra and Nimbus should remain
      expect(result).toHaveLength(2)
      expect(result.find((p) => p.name === ProviderName.ORION_CONNECT)).toBeUndefined()
      expect(result.find((p) => p.name === ProviderName.ASTRA_DIALER)).toBeDefined()
      expect(result.find((p) => p.name === ProviderName.NIMBUS_LOOKUP)).toBeDefined()
    })

    it('should return empty array when all providers are rate limited', async () => {
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
          rateLimit: { maxRequestsPerHour: 1 },
        },
      ]

      // Consume all limits
      await filter.consumeRateLimit(providers[0])
      await filter.consumeRateLimit(providers[1])

      const result = await filter.filter(providers, {})

      expect(result).toHaveLength(0)
    })
  })

  describe('consumeRateLimit()', () => {
    it('should return true when consuming under limit', async () => {
      const provider: ProviderConfig = {
        name: ProviderName.ORION_CONNECT,
        enabled: true,
        priority: 10,
        rateLimit: { maxRequestsPerHour: 100 },
      }

      const result = await filter.consumeRateLimit(provider)

      expect(result).toBe(true)
    })

    it('should return false when consuming over limit', async () => {
      const provider: ProviderConfig = {
        name: ProviderName.ORION_CONNECT,
        enabled: true,
        priority: 10,
        rateLimit: { maxRequestsPerHour: 2 },
      }

      // Consume limit
      await filter.consumeRateLimit(provider)
      await filter.consumeRateLimit(provider)

      // Third attempt should fail
      const result = await filter.consumeRateLimit(provider)

      expect(result).toBe(false)
    })

    it('should return true for providers without rate limit', async () => {
      const provider: ProviderConfig = {
        name: ProviderName.ASTRA_DIALER,
        enabled: true,
        priority: 5,
        // No rate limit
      }

      const result = await filter.consumeRateLimit(provider)

      expect(result).toBe(true)
    })

    it('should track rate limits per provider independently', async () => {
      const orion: ProviderConfig = {
        name: ProviderName.ORION_CONNECT,
        enabled: true,
        priority: 10,
        rateLimit: { maxRequestsPerHour: 1 },
      }

      const astra: ProviderConfig = {
        name: ProviderName.ASTRA_DIALER,
        enabled: true,
        priority: 5,
        rateLimit: { maxRequestsPerHour: 1 },
      }

      // Consume Orion's limit
      await filter.consumeRateLimit(orion)

      // Astra should still be available
      const astraResult = await filter.consumeRateLimit(astra)
      expect(astraResult).toBe(true)

      // Orion should be unavailable
      const orionResult = await filter.consumeRateLimit(orion)
      expect(orionResult).toBe(false)
    })
  })
})
