export type FindPhonesInput = {
  leadIds: number[]
  userTier?: number
}

export type FindPhonesOutput = {
  success: boolean
  foundCount: number
  results: Array<{
    leadId: number
    phone: string | null
    provider: string | null
  }>
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
