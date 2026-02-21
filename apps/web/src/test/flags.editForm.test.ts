import { describe, expect, it } from 'vitest'
import {
  emptyEditFlagFormState,
  toEditFlagMutationPayload,
  validateEditFlagForm,
} from '../pages/FlagsPage.form'

describe('flags edit form', () => {
  it('supports multivariate payload mapping', () => {
    const payload = toEditFlagMutationPayload({
      ...emptyEditFlagFormState,
      environmentId: 'env-1',
      key: 'experiment-checkout',
      name: 'Experiment checkout',
      valueType: 'MULTIVARIATE',
      defaultVariantKey: 'control',
      variants: [
        { key: 'control', valueType: 'string', value: 'A' },
        { key: 'treatment', valueType: 'json', value: '{"bucket":"B"}' },
      ],
    })

    expect(payload.valueType).toBe('MULTIVARIATE')
    expect(payload.multivariate).toEqual({
      defaultVariantKey: 'control',
      variants: [
        { key: 'control', valueType: 'string', value: 'A' },
        { key: 'treatment', valueType: 'json', value: '{"bucket":"B"}' },
      ],
    })
    expect(payload.booleanValue).toBeUndefined()
  })

  it('validates default variant key and variant presence for multivariate', () => {
    const noVariants = validateEditFlagForm({
      ...emptyEditFlagFormState,
      environmentId: 'env-1',
      key: 'exp',
      name: 'Experiment',
      valueType: 'MULTIVARIATE',
      defaultVariantKey: 'control',
      variants: [],
    })

    expect(noVariants).toBe('Add at least one variant for multivariate flags')
  })
})
