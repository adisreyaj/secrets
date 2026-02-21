export type VariantForm = {
  key: string
  valueType: 'string' | 'json'
  value: string
}

export type CreateFlagFormState = {
  environmentId: string
  key: string
  name: string
  description: string
  exposed: boolean
  runtime: 'both' | 'client' | 'server'
  labels: string
  booleanValue: boolean
}

export type EditFlagFormState = {
  environmentId: string
  key: string
  name: string
  description: string
  valueType: 'BOOLEAN' | 'MULTIVARIATE'
  exposed: boolean
  runtime: 'both' | 'client' | 'server'
  labels: string
  booleanValue: boolean
  defaultVariantKey: string
  variants: VariantForm[]
}

export const emptyCreateFlagFormState: CreateFlagFormState = {
  environmentId: '',
  key: '',
  name: '',
  description: '',
  exposed: true,
  runtime: 'both',
  labels: '',
  booleanValue: true,
}

export const emptyEditFlagFormState: EditFlagFormState = {
  ...emptyCreateFlagFormState,
  valueType: 'BOOLEAN',
  defaultVariantKey: '',
  variants: [],
}

const parseLabels = (input: string) =>
  input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const validateCreateFlagForm = (form: CreateFlagFormState): string | null => {
  if (!form.environmentId.trim()) {
    return 'Environment context is required'
  }
  if (!form.key.trim() || !form.name.trim()) {
    return 'Key and name are required'
  }
  return null
}

export const validateEditFlagForm = (form: EditFlagFormState): string | null => {
  const createValidation = validateCreateFlagForm(form)
  if (createValidation) {
    return createValidation
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

export const toCreateFlagMutationPayload = (
  form: CreateFlagFormState,
) => ({
  environmentId: form.environmentId,
  key: form.key.trim(),
  name: form.name.trim(),
  description: form.description.trim() || null,
  valueType: 'BOOLEAN' as const,
  exposed: form.exposed,
  enabled: form.exposed,
  runtime: form.runtime,
  labels: parseLabels(form.labels),
  booleanValue: form.booleanValue,
})

export const toEditFlagMutationPayload = (
  form: EditFlagFormState,
) => ({
  environmentId: form.environmentId,
  key: form.key.trim(),
  name: form.name.trim(),
  description: form.description.trim() || null,
  valueType: form.valueType,
  exposed: form.exposed,
  enabled: form.exposed,
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
