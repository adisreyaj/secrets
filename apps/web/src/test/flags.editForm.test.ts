import { describe, expect, it } from 'vitest'
import {
  emptyEditFlagFormState,
  toEditFlagMutationPayload,
  validateEditFlagForm,
} from '../pages/FlagsPage.form'

describe('flags edit form', () => {
  it('supports JSON payload mapping', () => {
    const payload = toEditFlagMutationPayload({
      ...emptyEditFlagFormState,
      environmentId: 'env-1',
      key: 'experiment-checkout',
      valueType: 'JSON',
      jsonValue: '{"bucket":"B"}',
    })

    expect(payload.valueType).toBe('JSON')
    expect(payload.jsonValue).toEqual({ bucket: 'B' })
    expect(payload.booleanValue).toBeUndefined()
  })

  it('validates JSON payload for JSON flags', () => {
    const invalid = validateEditFlagForm({
      ...emptyEditFlagFormState,
      environmentId: 'env-1',
      key: 'exp',
      valueType: 'JSON',
      jsonValue: '{invalid}',
    })

    expect(invalid).toBe('JSON value must be valid JSON')
  })
})
