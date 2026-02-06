import type { FeatureFlagConfig } from './types'

export const getFeatureFlagConfig = (): FeatureFlagConfig => {
  const env = import.meta.env
  const provider = (env.VITE_FF_PROVIDER ?? 'posthog').toLowerCase()

  return {
    provider,
    posthogKey: env.VITE_POSTHOG_KEY,
    posthogHost: env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    debug: env.VITE_FF_DEBUG === 'true',
  }
}
