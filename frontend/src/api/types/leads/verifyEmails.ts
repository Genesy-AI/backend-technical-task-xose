export type LeadsVerifyEmailsInput = {
  leadIds: number[]
}

export type LeadsVerifyEmailsOutput = {
  success: boolean
  verifiedCount: number
  results: Array<{
    leadId: number
    emailVerified: boolean | null
  }>
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
