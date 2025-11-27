import { ProviderConfig } from '../models/ProviderConfig';

/**
 * Context passed to provider filters.
 * Contains information needed for filtering decisions.
 */
export interface ProviderFilterContext {
    /** User tier level (for tier-based filtering) */
    userTier?: number;

    /** Additional context that filters might need */
    [key: string]: any;
}

/**
 * Interface for provider filtering strategies.
 * Implements Chain of Responsibility pattern.
 */
export interface IProviderFilter {
    /**
     * Filters a list of provider configurations based on specific criteria.
     * 
     * @param providers - List of provider configurations to filter
     * @param context - Context information for filtering decisions
     * @returns Filtered list of providers that meet the criteria
     */
    filter(providers: ProviderConfig[], context: ProviderFilterContext): Promise<ProviderConfig[]>;
}
