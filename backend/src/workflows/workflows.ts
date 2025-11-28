import { ActivityFunctionWithOptions, proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import { ProviderName } from '../domain/value-objects/ProviderName'
import { UserTier } from '../domain/models'
import { PhoneSearchParams } from '../domain/ports/IPhoneProvider'
import { PhoneResult } from './types/PhoneResult'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '10 seconds',
  },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

const { getAvailablePhoneProviders } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds', // Longer timeout for waterfall across multiple providers
  retry: {
    maximumAttempts: 3, // Critical step in the workflow as it determines which providers will be called
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '15 seconds',
  },
})

const { orionConnectFindPhone } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 seconds', // Longer timeout as it has the better data and sometimes is slow
  retry: {
    maximumAttempts: 2, // 1 retry since waterfall already tries multiple providers
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '15 seconds',
  },
})

const { astraDialerFindPhone, nimbusLookupFindPhone } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds', // Lower timeout as they are faster providers than Orion
  retry: {
    maximumAttempts: 2, // 1 retry since waterfall already tries multiple providers
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
  },
})

const mapProviderActivity = (
  providerName: ProviderName
): ActivityFunctionWithOptions<(params: PhoneSearchParams) => Promise<PhoneResult | null>> | null => {
  switch (providerName) {
    case ProviderName.ASTRA_DIALER:
      return astraDialerFindPhone
    case ProviderName.NIMBUS_LOOKUP:
      return nimbusLookupFindPhone
    case ProviderName.ORION_CONNECT:
      return orionConnectFindPhone
    default:
      return null
  }
}

export async function findPhoneWorkflow(params: {
  email?: string
  fullName?: string
  companyWebsite?: string
  jobTitle?: string
  userTier?: number
}): Promise<PhoneResult | null> {
  // Get available providers
  const availableProviders = await getAvailablePhoneProviders({
    userTier: params.userTier ?? UserTier.FREE, // FREE by default
  })

  // Waterfall: try each provider in order
  for (const config of availableProviders) {
    let result: PhoneResult | null = null

    try {
      const providerActivity = mapProviderActivity(config.name)
      if (!providerActivity) throw new Error(`No activity found for provider ${config.name}`)

      result = await providerActivity({
        email: params.email,
        fullName: params.fullName,
        companyWebsite: params.companyWebsite,
        jobTitle: params.jobTitle,
      })

      if (result) return result
    } catch (error) {
      console.error(`Provider ${config.name} activity failed after retries:`)
      // Continue to next provider
      continue
    }
  }

  return null
}
