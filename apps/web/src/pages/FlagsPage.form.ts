export type CreateFlagFormState = {
  environmentId: string
  key: string
  description: string
  valueType: 'BOOLEAN' | 'JSON'
  exposed: boolean
  runtime: 'both' | 'client' | 'server'
  labels: string
  booleanValue: boolean
  jsonValue: string
}

export type EditFlagFormState = CreateFlagFormState

export const emptyCreateFlagFormState: CreateFlagFormState = {
  environmentId: '',
  key: '',
  description: '',
  valueType: 'BOOLEAN',
  exposed: true,
  runtime: 'both',
  labels: '',
  booleanValue: true,
  jsonValue: '{\n  "enabled": true\n}',
}

export const emptyEditFlagFormState: EditFlagFormState = {
  ...emptyCreateFlagFormState,
}

const parseLabels = (input: string) =>
  input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const parseJson = (value: string): unknown => JSON.parse(value.trim())

export const validateCreateFlagForm = (form: CreateFlagFormState): string | null => {
  if (!form.environmentId.trim()) {
    return 'Environment context is required'
  }
  if (!form.key.trim()) {
    return 'Key is required'
  }
  if (form.valueType === 'JSON') {
    if (!form.jsonValue.trim()) {
      return 'JSON value is required for JSON flags'
    }
    try {
      parseJson(form.jsonValue)
    } catch {
      return 'JSON value must be valid JSON'
    }
  }
  return null
}

export const validateEditFlagForm = (form: EditFlagFormState): string | null =>
  validateCreateFlagForm(form)

export const toCreateFlagMutationPayload = (
  form: CreateFlagFormState,
) => ({
  environmentId: form.environmentId,
  key: form.key.trim(),
  description: form.description.trim() || null,
  valueType: form.valueType,
  exposed: form.exposed,
  enabled: form.exposed,
  runtime: form.runtime,
  labels: parseLabels(form.labels),
  booleanValue: form.valueType === 'BOOLEAN' ? form.booleanValue : undefined,
  jsonValue: form.valueType === 'JSON' ? parseJson(form.jsonValue) : undefined,
})

export const toEditFlagMutationPayload = (
  form: EditFlagFormState,
) => ({
  environmentId: form.environmentId,
  key: form.key.trim(),
  description: form.description.trim() || null,
  valueType: form.valueType,
  exposed: form.exposed,
  enabled: form.exposed,
  runtime: form.runtime,
  labels: parseLabels(form.labels),
  booleanValue: form.valueType === 'BOOLEAN' ? form.booleanValue : undefined,
  jsonValue: form.valueType === 'JSON' ? parseJson(form.jsonValue) : undefined,
})
