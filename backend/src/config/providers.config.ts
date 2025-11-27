import { ProviderName } from '../domain/value-objects/ProviderName';
import { ProviderConfig, UserTier } from '../domain/models/ProviderConfig';

/**
 * Provider configuration for phone lookup services.
 * 
 * Configuration guidelines:
 * - priority: Higher values are tried first (10 = highest, 1 = lowest)
 * - rateLimit: Hourly limits to prevent API quota exhaustion
 * - minUserTier: Minimum user tier required (undefined = available to all)
 * - enabled: Feature flag to quickly disable providers
 * 
 * Priority ordering rationale:
 * 1. Orion Connect (10): Best data quality, slowest, premium tier only
 * 2. Nimbus Lookup (5): Newest provider, still being evaluated
 * 3. Astra Dialer (1): Worst data quality, fastest, available for all users
 */
export const PROVIDER_CONFIGS: ProviderConfig[] = [
    {
        name: ProviderName.ORION_CONNECT,
        enabled: true,
        priority: 10,
        rateLimit: {
            maxRequestsPerHour: 100,
        },
        // minUserTier: UserTier.PREMIUM,
    },
    {
        name: ProviderName.NIMBUS_LOOKUP,
        enabled: true,
        priority: 5,
        rateLimit: {
            maxRequestsPerHour: 300,
        },
        // minUserTier: UserTier.BASIC,
    },
    {
        name: ProviderName.ASTRA_DIALER,
        enabled: true,
        priority: 1,
        // No rate limit (this provider acts always as a fallback)
        // Available to all users (no minUserTier restriction)
    },
];

/**
 * Provider API configuration from environment variables.
 * Provides default URLs and keys for development/testing.
 */
export const PROVIDER_API_CONFIG = {
    [ProviderName.ORION_CONNECT]: {
        url: process.env.ORION_CONNECT_API_URL || '',
        apiKey: process.env.ORION_CONNECT_API_KEY || '',
    },
    [ProviderName.ASTRA_DIALER]: {
        url: process.env.ASTRA_DIALER_API_URL || '',
        apiKey: process.env.ASTRA_DIALER_API_KEY || '',
    },
    [ProviderName.NIMBUS_LOOKUP]: {
        url: process.env.NIMBUS_LOOKUP_API_URL || '',
        apiKey: process.env.NIMBUS_LOOKUP_API_KEY || '',
    },
} as const;
