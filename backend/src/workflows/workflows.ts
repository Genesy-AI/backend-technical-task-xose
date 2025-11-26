import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '10 seconds',
  }
})

const { findPhone } = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds', // Longer timeout for waterfall across multiple providers
  retry: {
    maximumAttempts: 2, // Less retries since waterfall already tries multiple providers
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '15 seconds',
  }
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

export async function findPhoneWorkflow(params: {
  email?: string
  fullName?: string
  companyWebsite?: string
  jobTitle?: string
  userTier?: number
}): Promise<{ phone: string; provider: string; countryCode?: string } | null> {
  return await findPhone(params)
}

