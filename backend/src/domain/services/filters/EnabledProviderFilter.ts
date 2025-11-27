import { IProviderFilter, ProviderFilterContext } from '../IProviderFilter';
import { ProviderConfig } from '../../models/ProviderConfig';

/**
 * Filter that removes disabled providers.
 * First step in the filtering chain.
 */
export class EnabledProviderFilter implements IProviderFilter {
    async filter(providers: ProviderConfig[], _context: ProviderFilterContext): Promise<ProviderConfig[]> {
        return providers.filter((provider) => provider.enabled);
    }
}
