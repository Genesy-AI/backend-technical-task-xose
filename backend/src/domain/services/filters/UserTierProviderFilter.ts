import { IProviderFilter, ProviderFilterContext } from '../IProviderFilter';
import { ProviderConfig } from '../../models/ProviderConfig';

/**
 * Filter that removes providers based on user tier requirements.
 * Providers without minUserTier are available to all users.
 */
export class UserTierProviderFilter implements IProviderFilter {
    async filter(providers: ProviderConfig[], context: ProviderFilterContext): Promise<ProviderConfig[]> {
        const userTier = context.userTier ?? 0; // Default to lowest tier if not specified

        return providers.filter((provider) => {
            // If no tier requirement, allow all users
            if (provider.minUserTier === undefined) {
                return true;
            }

            // Check if user meets minimum tier requirement
            return userTier >= provider.minUserTier;
        });
    }
}
