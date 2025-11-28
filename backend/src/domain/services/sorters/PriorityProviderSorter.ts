import { ProviderConfig } from '../../models/ProviderConfig'

/**
 * Sorter that orders providers by priority (higher priority first).
 * Providers with the same priority maintain their relative order (stable sort).
 */
export class PriorityProviderSorter {
  sort(providers: ProviderConfig[]): ProviderConfig[] {
    // Create a copy to avoid mutating the original array
    return [...providers].sort((a, b) => b.priority - a.priority)
  }
}
