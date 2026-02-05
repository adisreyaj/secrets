export const queryKeys = {
  projects: () => ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  environments: (projectId: string) =>
    ['projects', projectId, 'environments'] as const,
  environment: (environmentId: string) =>
    ['environments', environmentId] as const,
  secrets: (environmentId: string, includeValues: boolean) =>
    ['environments', environmentId, 'secrets', includeValues] as const,
  approvals: (
    projectId: string,
    status?: string,
    environmentId?: string | null,
  ) =>
    [
      'projects',
      projectId,
      'approvals',
      status ?? 'all',
      environmentId ?? 'all',
    ] as const,
  approvalRules: (projectId: string) =>
    ['projects', projectId, 'approval-rules'] as const,
  approval: (approvalId: string) => ['approvals', approvalId] as const,
  members: (projectId: string) => ['projects', projectId, 'members'] as const,
  invites: (projectId: string) => ['projects', projectId, 'invites'] as const,
  tokens: (projectId: string) => ['projects', projectId, 'tokens'] as const,
  serviceAccounts: (projectId: string) =>
    ['projects', projectId, 'service-accounts'] as const,
  serviceAccountTokens: (accountId: string) =>
    ['service-accounts', accountId, 'tokens'] as const,
  audit: (projectId: string, filtersKey?: string) =>
    ['projects', projectId, 'audit', filtersKey ?? 'all'] as const,
  secretVersions: (secretId: string) =>
    ['secrets', secretId, 'versions'] as const,
  secretDiff: (secretId: string, from?: string, to?: string) =>
    ['secrets', secretId, 'diff', from ?? 'current', to ?? 'current'] as const,
  searchSecrets: (
    projectId: string,
    query: string,
    environmentId?: string | null,
    includeValues?: boolean,
  ) =>
    [
      'projects',
      projectId,
      'secrets',
      'search',
      query,
      environmentId ?? 'all',
      includeValues ? 'values' : 'keys',
    ] as const,
  secretCoverage: (projectId: string) =>
    ['projects', projectId, 'secrets', 'coverage'] as const,
}
