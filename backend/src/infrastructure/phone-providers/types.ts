export interface OrionConnectResponse {
    phone: string | null
}

export interface AstraDialerResponse {
    phoneNmbr: string | null | undefined
}

export interface NimbusLookupResponse {
    phoneNmbr: number
    countryCode: string
}