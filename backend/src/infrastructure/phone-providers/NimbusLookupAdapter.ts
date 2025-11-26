import { IPhoneProvider, PhoneSearchParams, PhoneProviderResult } from '../../domain/ports/IPhoneProvider'
import { ProviderName } from '../../domain/value-objects/ProviderName'
import { NimbusLookupResponse } from './types'

export class NimbusLookupAdapter implements IPhoneProvider {
    readonly name = ProviderName.NIMBUS_LOOKUP

    constructor(
        private readonly apiUrl: string,
        private readonly apiKey: string
    ) { }

    async findPhone(params: PhoneSearchParams): Promise<PhoneProviderResult | null> {
        if (!params.email || !params.jobTitle) return null;
        console.log("-- [Nimbus Lookup] Finding phone...")


        const url = new URL(this.apiUrl)
        url.searchParams.set('api', this.apiKey)

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: params.email,
                jobTitle: params.jobTitle,
            }),
        })

        if (!response.ok) {
            throw new Error(`Nimbus Lookup failed: ${response.status}`)
        }

        const data: NimbusLookupResponse = await response.json()

        console.log("-- [Nimbus Lookup] Phone found: ", data?.phoneNmbr)

        if (!data.phoneNmbr) return null;
        return {
            phone: String(data.phoneNmbr),
            countryCode: data.countryCode || undefined,
        }
    }
}