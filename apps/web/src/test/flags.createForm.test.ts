import { describe, expect, it } from 'vitest'
import {
  emptyCreateFlagFormState,
  toCreateFlagMutationPayload,
  validateCreateFlagForm,
} from '../pages/FlagsPage.form'

describe('flags create form', () => {
  it('builds a boolean payload without environment overrides', () => {
    const payload = toCreateFlagMutationPayload({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      key: 'checkout-redesign',
      name: 'Checkout redesign',
      booleanValue: false,
    })

    expect(payload).toMatchObject({
      environmentId: 'env-1',
      key: 'checkout-redesign',
      name: 'Checkout redesign',
      valueType: 'BOOLEAN',
      exposed: true,
      enabled: true,
      booleanValue: false,
      runtime: 'both',
      labels: [],
      description: null,
    })
    expect('environmentOverrides' in payload).toBe(false)
    expect('multivariate' in payload).toBe(false)
  })

  it('applies advanced defaults when create uses only minimum inputs', () => {
    const payload = toCreateFlagMutationPayload({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      key: 'new-flag',
      name: 'New flag',
    })

    expect(payload).toMatchObject({
      exposed: true,
      enabled: true,
      runtime: 'both',
      labels: [],
      description: null,
      booleanValue: true,
      valueType: 'BOOLEAN',
    })
  })

  it('validates required key and name', () => {
    const missingKey = validateCreateFlagForm({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      name: 'Name only',
    })
    const missingName = validateCreateFlagForm({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      key: 'key-only',
    })

    expect(missingKey).toBe('Key and name are required')
    expect(missingName).toBe('Key and name are required')
  })
})
