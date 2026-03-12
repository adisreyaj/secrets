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
      booleanValue: false,
    })

    expect(payload).toMatchObject({
      environmentId: 'env-1',
      key: 'checkout-redesign',
      valueType: 'BOOLEAN',
      exposed: true,
      enabled: true,
      booleanValue: false,
      runtime: 'both',
      labels: [],
      description: null,
    })
    expect('environmentOverrides' in payload).toBe(false)
    expect(payload.jsonValue).toBeUndefined()
  })

  it('applies advanced defaults when create uses only minimum inputs', () => {
    const payload = toCreateFlagMutationPayload({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      key: 'new-flag',
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

  it('builds a JSON payload with parsed jsonValue', () => {
    const payload = toCreateFlagMutationPayload({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      key: 'json-flag',
      valueType: 'JSON',
      jsonValue: '{"bucket":"B"}',
    })

    expect(payload.valueType).toBe('JSON')
    expect(payload.jsonValue).toEqual({ bucket: 'B' })
    expect(payload.booleanValue).toBeUndefined()
  })

  it('validates required key', () => {
    const missingKey = validateCreateFlagForm({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
    })

    expect(missingKey).toBe('Key is required')
  })

  it('validates json payload shape for JSON flags', () => {
    const invalid = validateCreateFlagForm({
      ...emptyCreateFlagFormState,
      environmentId: 'env-1',
      key: 'json-flag',
      valueType: 'JSON',
      jsonValue: '{bad}',
    })

    expect(invalid).toBe('JSON value must be valid JSON')
  })
})
