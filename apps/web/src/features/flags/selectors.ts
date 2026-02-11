import type { FeatureFlagDto } from '@secrets/shared'
import type { FlagOverrideSummary } from './types'

export const getFlagOverrideSummary = (
  _flag: FeatureFlagDto,
  environmentName?: string | null,
): FlagOverrideSummary => {
  const envLabel = environmentName?.trim() || 'selected environment';
  return {
    status: 'configured',
    label: `Configured in ${envLabel}`,
  }
}
