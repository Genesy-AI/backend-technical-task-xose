import { IPhoneProvider, PhoneSearchParams, PhoneProviderResult } from '../../domain/ports/IPhoneProvider'
import { ProviderName } from '../../domain/value-objects/ProviderName'
import { OrionConnectResponse } from './types'

export class OrionConnectAdapter implements IPhoneProvider {
  readonly name = ProviderName.ORION_CONNECT

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string
  ) {}

  async findPhone(params: PhoneSearchParams): Promise<PhoneProviderResult | null> {
    console.debug('-- [Orion Connect] Finding phone...')
    if (!params.fullName || !params.companyWebsite) return null

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-me': this.apiKey,
      },
      body: JSON.stringify({
        fullName: params.fullName,
        companyWebsite: params.companyWebsite,
      }),
    })

    if (!response.ok) {
      throw new Error(`Orion Connect failed: ${response.status}`)
    }

    const data: OrionConnectResponse = await response.json()
    console.debug('-- [Orion Connect] Phone found: ', data?.phone)

    if (!data.phone) return null
    return {
      phone: data.phone,
    }
  }
}
