export type FeatureFlagValue = boolean | string | number | null

export interface FeatureFlagUser {
  id: string
  email?: string
  name?: string
}

export interface FeatureFlagProviderAdapter {
  init: (options: FeatureFlagConfig) => Promise<void> | void
  identify: (user: FeatureFlagUser) => void
  reset: () => void
  getFlag: <T extends FeatureFlagValue>(
    key: string,
    defaultValue?: T,
  ) => T
  onFlagsChanged?: (callback: () => void) => () => void
}

export interface FeatureFlagConfig {
  provider: 'posthog' | 'none' | string
  posthogKey?: string
  posthogHost?: string
  debug?: boolean
}
