import { PhoneSearchParams, IPhoneProvider, PhoneProviderResult } from './IPhoneProvider';

/**
 * Interface for Temporal activities that wrap provider calls.
 * Each provider activity should implement this interface.
 */
export interface IPhoneProviderActivity {
    /** Reference to the provider implementation (used for rate limit, logic, etc.) */
    provider: IPhoneProvider;
    findPhone(params: PhoneSearchParams): Promise<PhoneProviderResult | null>;
}
