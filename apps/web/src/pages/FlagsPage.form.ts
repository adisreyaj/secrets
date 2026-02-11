export type VariantForm = {
  key: string
  valueType: 'string' | 'json'
  value: string
}

export type FlagFormState = {
  key: string
  name: string
  description: string
  valueType: 'BOOLEAN' | 'MULTIVARIATE'
  enabled: boolean
  runtime: 'both' | 'client' | 'server'
  labels: string
  booleanValue: boolean
  defaultVariantKey: string
  variants: VariantForm[]
}

export const emptyFlagFormState: FlagFormState = {
  key: '',
  name: '',
  description: '',
  valueType: 'BOOLEAN',
  enabled: true,
  runtime: 'both',
  labels: '',
  booleanValue: true,
  defaultVariantKey: '',
  variants: [],
}

const parseLabels = (input: string) =>
  input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const validateFlagForm = (form: FlagFormState): string | null => {
  if (!form.key.trim() || !form.name.trim()) {
    return 'Key and name are required'
  }

  if (form.valueType === 'MULTIVARIATE') {
    if (!form.defaultVariantKey.trim()) {
      return 'Default variant key is required for multivariate flags'
    }
    if (form.variants.length === 0) {
      return 'Add at least one variant for multivariate flags'
    }
    if (!form.variants.some((variant) => variant.key === form.defaultVariantKey)) {
      return 'Default variant key must match one of the variants'
    }
    for (const variant of form.variants) {
      if (!variant.key.trim()) {
        return 'Each variant requires a key'
      }
      if (variant.valueType === 'json') {
        try {
          JSON.parse(variant.value)
        } catch {
          return `Variant ${variant.key} has invalid JSON`
        }
      }
    }
  }

  return null
}

export const toFlagMutationPayload = (
  form: FlagFormState,
  environmentId: string,
) => ({
  environmentId,
  key: form.key.trim(),
  name: form.name.trim(),
  description: form.description.trim() || null,
  valueType: form.valueType,
  enabled: form.enabled,
  runtime: form.runtime,
  labels: parseLabels(form.labels),
  booleanValue: form.valueType === 'BOOLEAN' ? form.booleanValue : undefined,
  multivariate:
    form.valueType === 'MULTIVARIATE'
      ? {
          defaultVariantKey: form.defaultVariantKey,
          variants: form.variants.map((variant) => ({
            key: variant.key.trim(),
            valueType: variant.valueType,
            value: variant.value,
          })),
        }
      : null,
})
