import { ProviderName } from '../value-objects/ProviderName';

/**
 * Rate limit configuration for a provider.
 * Uses hourly time window for simplicity.
 */
export interface RateLimitConfig {
    /** Maximum number of requests per hour */
    maxRequestsPerHour: number;
}

/**
 * User tier levels for provider access control.
 * Higher tiers have access to more providers.
 */
export enum UserTier {
    FREE = 0,
    BASIC = 1,
    PREMIUM = 2,
    ENTERPRISE = 3,
}

/**
 * Configuration for a phone provider.
 * Controls availability, priority, rate limiting, and access control.
 */
export interface ProviderConfig {
    /** Provider identifier */
    name: ProviderName;

    /** Whether the provider is currently enabled */
    enabled: boolean;

    /**
     * Priority for provider selection (higher = tried first).
     * Providers with same priority are tried in order of appearance.
     */
    priority: number;

    /**
     * Rate limiting configuration.
     * If undefined, no rate limiting is applied.
     */
    rateLimit?: RateLimitConfig;

    /**
     * Minimum user tier required to use this provider.
     * If undefined, available to all users.
     */
    minUserTier?: UserTier;
}
