const ACTION_LABELS: Record<string, string> = {
  'environment.create': 'Create Environment',
  'environment.update': 'Update Environment',
  'environment.delete': 'Delete Environment',
  'project.create': 'Create Project',
  'project.update': 'Update Project',
  'project.delete': 'Delete Project',
  'secret.copy.bulk': 'Bulk Copy Secret',
  'secret.create': 'Create Secret',
  'secret.update': 'Update Secret',
  'secret.delete': 'Delete Secret',
  'service_account.create': 'Create Service Account',
  'service_account.update': 'Update Service Account',
  'service_account.delete': 'Delete Service Account',
  'service_account.token.create': 'Create Service Account Token',
  'service_account.token.delete': 'Delete Service Account Token',
  'token.create': 'Create API Token',
  'token.delete': 'Delete API Token',
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  api_token: 'API token',
  environment: 'Environment',
  project: 'Project',
  secret: 'Secret',
  service_account: 'Service Account',
  service_account_token: 'Service Account Token',
}

const humanizeToken = (value: string) =>
  value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export const humanizeAction = (action: string) => {
  if (!action) return action
  const mapped = ACTION_LABELS[action]
  if (mapped) return mapped

  const parts = action.split('.').filter(Boolean)
  if (parts.length === 0) return action

  const verb = parts[parts.length - 1]
  const noun = parts.slice(0, -1).join(' ')
  const verbLabel = humanizeToken(verb)
  const nounLabel = humanizeToken(noun)
  return nounLabel ? `${verbLabel} ${nounLabel}` : verbLabel
}

export const humanizeResourceType = (type: string) => {
  if (!type) return type
  return RESOURCE_TYPE_LABELS[type] ?? humanizeToken(type)
}
