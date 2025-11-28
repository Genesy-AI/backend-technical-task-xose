import { ProviderName } from '../value-objects/ProviderName'

export interface PhoneSearchParams {
  email?: string
  fullName?: string
  companyWebsite?: string
  jobTitle?: string
}

export interface PhoneProviderResult {
  phone: string
  countryCode?: string
}

export interface IPhoneProvider {
  readonly name: ProviderName
  findPhone(params: PhoneSearchParams): Promise<PhoneProviderResult | null>
}
