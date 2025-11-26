import { IProviderFilter, ProviderFilterContext } from './IProviderFilter';
import { ProviderConfig } from '../models/ProviderConfig';
import { PriorityProviderSorter } from './sorters/PriorityProviderSorter';

/**
 * Orchestrates the provider selection process.
 * Applies filters in sequence, then sorts by priority.
 * 
 * Pipeline stages:
 * 1. Apply all filters in sequence (Chain of Responsibility)
 * 2. Sort remaining providers by priority
 * 3. Return ordered list
 */
export class ProviderSelectionPipeline {
    private filters: IProviderFilter[] = [];
    private sorter: PriorityProviderSorter;

    constructor() {
        this.sorter = new PriorityProviderSorter();
    }

    /**
     * Adds a filter to the pipeline.
     * Filters are applied in the order they are added.
     */
    addFilter(filter: IProviderFilter): this {
        this.filters.push(filter);
        return this;
    }

    /**
     * Executes the full selection pipeline.
     * 
     * @param providers - All configured providers
     * @param context - Context for filtering decisions
     * @returns Filtered and sorted providers, ready for use
     */
    async execute(providers: ProviderConfig[], context: ProviderFilterContext): Promise<ProviderConfig[]> {
        let result = providers;

        // Apply all filters in sequence
        for (const filter of this.filters) {
            result = await filter.filter(result, context);
        }

        // Sort by priority
        return this.sorter.sort(result);
    }
}
