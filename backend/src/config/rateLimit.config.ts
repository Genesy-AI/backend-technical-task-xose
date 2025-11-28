/**
 * Rate limiting configuration for the application.
 *
 * Redis is used for distributed rate limiting across multiple workers.
 * If Redis is unavailable, the system falls back to in-memory rate limiting
 * (which is per-worker and not shared).
 */

/**
 * Redis connection configuration.
 */
export const REDIS_CONFIG = {
  url: process.env.REDIS_URL || '',

  /**
   * Force in-memory rate limiting even if Redis is available.
   * Useful for testing single-worker scenarios.
   */
  forceInMemory: process.env.FORCE_IN_MEMORY_RATE_LIMIT === 'true',
} as const

/**
 * Rate limit window configuration.
 */
export const RATE_LIMIT_WINDOW = {
  /**
   * Time window for rate limiting in seconds.
   * Default: 3600 seconds (1 hour)
   */
  windowSeconds: 3600,

  /**
   * Key prefix for Redis rate limit keys.
   * Format: {prefix}:{providerName}:{timestamp}
   * Example: provider:ORION_CONNECT:2025-11-26T14
   */
  keyPrefix: 'provider',
} as const
