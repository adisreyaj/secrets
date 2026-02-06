import posthog from 'posthog-js'
import type { FeatureFlagProviderAdapter, FeatureFlagValue } from '../types'

export const createPosthogAdapter = (): FeatureFlagProviderAdapter => {
  return {
    init: ({ posthogKey, posthogHost, debug }) => {
      if (!posthogKey) return
      posthog.init(posthogKey, {
        api_host: posthogHost,
        debug: Boolean(debug),
      })
    },
    identify: (user) => {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
      })
    },
    reset: () => {
      posthog.reset()
    },
    getFlag: <T extends FeatureFlagValue>(key: string, defaultValue?: T) => {
      const value = posthog.getFeatureFlag(key) as T | null | undefined
      return (value ?? defaultValue ?? null) as T
    },
    onFlagsChanged: (callback) => posthog.onFeatureFlags(callback),
  }
}
