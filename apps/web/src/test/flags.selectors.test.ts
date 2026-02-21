import type { FeatureFlagDto } from '@secrets/shared'
import { describe, expect, it } from 'vitest'
import { getFlagOverrideSummary } from '../features/flags/selectors'

const baseFlag: FeatureFlagDto = {
  id: 'f1',
  projectId: 'p1',
  environmentId: 'env-dev',
  key: 'checkout-redesign',
  name: 'Checkout redesign',
  valueType: 'BOOLEAN',
  exposed: true,
  enabled: true,
  runtime: 'both',
  labels: [],
  booleanValue: true,
  createdAt: '2026-02-11T00:00:00.000Z',
  updatedAt: '2026-02-11T00:00:00.000Z',
}

describe('flags selectors', () => {
  it('returns configured summary with selected environment name', () => {
    expect(getFlagOverrideSummary(baseFlag, 'Prod')).toEqual({
      status: 'configured',
      label: 'Configured in Prod',
    })
  })

  it('returns fallback summary when environment name is missing', () => {
    expect(getFlagOverrideSummary(baseFlag, null)).toEqual({
      status: 'configured',
      label: 'Configured in selected environment',
    })
  })
})
