import { IPhoneProvider, PhoneSearchParams, PhoneProviderResult } from '../../domain/ports/IPhoneProvider'
import { ProviderName } from '../../domain/value-objects/ProviderName'
import { AstraDialerResponse } from './types'

export class AstraDialerAdapter implements IPhoneProvider {
    readonly name = ProviderName.ASTRA_DIALER

    constructor(
        private readonly apiUrl: string,
        private readonly apiKey: string
    ) { }

    async findPhone(params: PhoneSearchParams): Promise<PhoneProviderResult | null> {
        if (!params.email) return null;
        console.debug("-- [Astra Dialer] Finding phone...")

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apiKey': this.apiKey,
            },
            body: JSON.stringify({
                email: params.email,
            }),
        })

        if (!response.ok) {
            throw new Error(`Astra Dialer failed: ${response.status}`)
        }

        const data: AstraDialerResponse = await response.json()

        console.debug("-- [Astra Dialer] Phone found: ", data?.phoneNmbr)

        if (!data.phoneNmbr) return null;
        return {
            phone: data.phoneNmbr,
        };

    }
}