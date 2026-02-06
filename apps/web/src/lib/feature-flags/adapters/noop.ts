import type { FeatureFlagProviderAdapter, FeatureFlagValue } from '../types'

export const createNoopAdapter = (): FeatureFlagProviderAdapter => {
  return {
    init: () => undefined,
    identify: () => undefined,
    reset: () => undefined,
    getFlag: <T extends FeatureFlagValue>(
      _key: string,
      defaultValue?: T,
    ) => (defaultValue ?? null) as T,
  }
}
