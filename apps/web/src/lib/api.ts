import type {
  ApiTokenDto,
  AuditLogFilters,
  AuditLogDto,
  AuditRetentionDto,
  AuthResponse,
  CliLoginIssueRequest,
  CliLoginIssueResponse,
  CreateInviteRequest,
  CreateInviteResponse,
  CreateEnvironmentRequest,
  DeleteEnvironmentRequest,
  DeleteProjectRequest,
  CreateProjectRequest,
  CreateTokenRequest,
  CreateTokenResponse,
  EnvironmentDto,
  LoginRequest,
  ProjectDto,
  ProjectMemberDto,
  ProjectInviteDto,
  RegisterRequest,
  AcceptInviteRequest,
  AcceptInviteResponse,
  UpdateMeRequest,
  ApprovalRuleDto,
  ApprovalRequestDto,
  CreateApprovalRuleRequest,
  UpdateApprovalRuleRequest,
  ApprovalStatus,
  ApprovalAction,
  ServiceAccountDto,
  ServiceAccountTokenDto,
  CreateServiceAccountRequest,
  CreateServiceAccountTokenRequest,
  CreateServiceAccountTokenResponse,
  ProjectModuleDto,
  UpdateProjectModuleRequest,
  FeatureFlagDto,
  FeatureFlagEnvironmentDiffDto,
  FeatureFlagSdkKeyDto,
  AuthProjectConfigDto,
  AuthProviderDto,
  AuthClientDto,
} from '@secrets/shared'
import { apiFetch, resetCsrfToken } from './apiBase'
import { createSecretsClient } from './api/secretsClient'
export { ApiError } from './apiBase'

export const api = {
  getMe: () => apiFetch<AuthResponse>('/me'),
  register: async (payload: RegisterRequest) => {
    resetCsrfToken()
    return apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  login: async (payload: LoginRequest) => {
    resetCsrfToken()
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  logout: async () => {
    const result = await apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' })
    resetCsrfToken()
    return result
  },
  updateMe: (payload: UpdateMeRequest) =>
    apiFetch<AuthResponse>('/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  listProjects: () => apiFetch<ProjectDto[]>('/projects'),
  createProject: (payload: CreateProjectRequest) =>
    apiFetch<ProjectDto>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteProject: (projectId: string, payload: DeleteProjectRequest) =>
    apiFetch<{ ok: true }>(`/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),
  getProjectBySlug: (slug: string) =>
    apiFetch<ProjectDto>(`/projects/slug/${slug}`),
  listProjectModules: (projectId: string) =>
    apiFetch<ProjectModuleDto[]>(`/projects/${projectId}/modules`),
  updateProjectModule: (
    projectId: string,
    module: 'secrets' | 'flags' | 'auth',
    payload: UpdateProjectModuleRequest,
  ) =>
    apiFetch<ProjectModuleDto>(`/projects/${projectId}/modules/${module}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  listFlags: (projectId: string, environmentId?: string | null) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    return apiFetch<FeatureFlagDto[]>(
      `/projects/${projectId}/flags${params.size ? `?${params.toString()}` : ''}`,
    )
  },
  createFlag: (
    projectId: string,
    payload: {
      environmentId: string
      key: string
      name: string
      description?: string | null
      valueType: 'BOOLEAN' | 'MULTIVARIATE'
      enabled: boolean
      runtime: 'both' | 'client' | 'server'
      labels: string[]
      booleanValue?: boolean | null
      multivariate?: {
        defaultVariantKey: string
        variants: {
          key: string
          valueType: 'string' | 'json'
          value: string
        }[]
      } | null
    },
  ) =>
    apiFetch<FeatureFlagDto>(`/projects/${projectId}/flags`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getFlag: (flagId: string, environmentId?: string | null) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    return apiFetch<FeatureFlagDto>(
      `/flags/${flagId}${params.size ? `?${params.toString()}` : ''}`,
    )
  },
  updateFlag: (
    flagId: string,
    payload: {
      environmentId: string
      key?: string
      name?: string
      description?: string | null
      valueType?: 'BOOLEAN' | 'MULTIVARIATE'
      enabled?: boolean
      runtime?: 'both' | 'client' | 'server'
      labels?: string[]
      booleanValue?: boolean | null
      multivariate?: {
        defaultVariantKey: string
        variants: {
          key: string
          valueType: 'string' | 'json'
          value: string
        }[]
      } | null
    },
  ) =>
    apiFetch<FeatureFlagDto>(`/flags/${flagId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteFlag: (flagId: string, environmentId: string) =>
    apiFetch<{ ok: true }>(`/flags/${flagId}`, {
      method: 'DELETE',
      body: JSON.stringify({ environmentId }),
    }),
  getFlagDiff: (
    flagId: string,
    fromEnvironmentId: string,
    toEnvironmentId: string,
  ) =>
    apiFetch<FeatureFlagEnvironmentDiffDto>(
      `/flags/${flagId}/diff?fromEnvironmentId=${encodeURIComponent(fromEnvironmentId)}&toEnvironmentId=${encodeURIComponent(toEnvironmentId)}`,
    ),
  listFlagSdkKeys: (projectId: string, environmentId?: string | null) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    return apiFetch<FeatureFlagSdkKeyDto[]>(
      `/projects/${projectId}/flag-sdk-keys${params.size ? `?${params.toString()}` : ''}`,
    )
  },
  createFlagSdkKey: (
    projectId: string,
    payload: {
      name: string
      environmentIds?: string[]
      expiresAt?: string | null
    },
  ) =>
    apiFetch<{ key: string; keyMeta: FeatureFlagSdkKeyDto }>(
      `/projects/${projectId}/flag-sdk-keys`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  rotateFlagSdkKey: (keyId: string, environmentIds?: string[]) =>
    apiFetch<{ key: string; keyMeta: FeatureFlagSdkKeyDto }>(
      `/flag-sdk-keys/${keyId}/rotate`,
      {
        method: 'POST',
        body: JSON.stringify(
          environmentIds ? { environmentIds } : {},
        ),
      },
    ),
  updateFlagSdkKey: (
    keyId: string,
    payload: { name?: string; environmentIds?: string[] },
  ) =>
    apiFetch<FeatureFlagSdkKeyDto>(`/flag-sdk-keys/${keyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  revokeFlagSdkKey: (keyId: string) =>
    apiFetch<{ ok: true }>(`/flag-sdk-keys/${keyId}`, { method: 'DELETE' }),
  getAuthConfig: (projectId: string) =>
    apiFetch<AuthProjectConfigDto & { accessTokenTtlMinutes: number; refreshTokenTtlDays: number }>(
      `/projects/${projectId}/auth/config`,
    ),
  updateAuthConfig: (
    projectId: string,
    payload: {
      nativeAuthEnabled?: boolean
      emailPasswordEnabled?: boolean
      accessTokenTtlMinutes?: number
      refreshTokenTtlDays?: number
    },
  ) =>
    apiFetch<AuthProjectConfigDto & { accessTokenTtlMinutes: number; refreshTokenTtlDays: number }>(
      `/projects/${projectId}/auth/config`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  listAuthProviders: (projectId: string) =>
    apiFetch<AuthProviderDto[]>(`/projects/${projectId}/auth/providers`),
  createAuthProvider: (
    projectId: string,
    payload: {
      provider: 'google' | 'github'
      enabled?: boolean
      clientId: string
      clientSecret: string
      scopes?: string[]
    },
  ) =>
    apiFetch<AuthProviderDto>(`/projects/${projectId}/auth/providers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAuthProvider: (
    providerId: string,
    payload: {
      enabled?: boolean
      clientId?: string
      scopes?: string[]
    },
  ) =>
    apiFetch<AuthProviderDto>(`/auth/providers/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  rotateAuthProviderSecret: (providerId: string, clientSecret: string) =>
    apiFetch<AuthProviderDto>(`/auth/providers/${providerId}/rotate-secret`, {
      method: 'POST',
      body: JSON.stringify({ clientSecret }),
    }),
  listAuthClients: (projectId: string) =>
    apiFetch<AuthClientDto[]>(`/projects/${projectId}/auth/clients`),
  createAuthClient: (
    projectId: string,
    payload: {
      name: string
      type?: 'public' | 'confidential'
      redirectUris?: string[]
    },
  ) =>
    apiFetch<{ client: AuthClientDto; clientSecret?: string }>(
      `/projects/${projectId}/auth/clients`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  updateAuthClient: (
    clientId: string,
    payload: {
      name?: string
      redirectUris?: string[]
      rotateSecret?: boolean
    },
  ) =>
    apiFetch<{ client: AuthClientDto; clientSecret?: string }>(
      `/auth/clients/${clientId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),
  deleteAuthClient: (clientId: string) =>
    apiFetch<{ ok: true }>(`/auth/clients/${clientId}`, { method: 'DELETE' }),

  listEnvironments: (projectId: string) =>
    apiFetch<EnvironmentDto[]>(`/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, payload: CreateEnvironmentRequest) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteEnvironment: (
    projectId: string,
    environmentId: string,
    payload: DeleteEnvironmentRequest,
  ) =>
    apiFetch<{ ok: true }>(
      `/projects/${projectId}/environments/${environmentId}`,
      {
        method: 'DELETE',
        body: JSON.stringify(payload),
      },
    ),
  getEnvironmentBySlug: (projectId: string, slug: string) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments/slug/${slug}`),
  ...createSecretsClient(apiFetch),

  listTokens: (projectId: string) =>
    apiFetch<ApiTokenDto[]>(`/projects/${projectId}/api-tokens`),
  createToken: (projectId: string, payload: CreateTokenRequest) =>
    apiFetch<CreateTokenResponse>(`/projects/${projectId}/api-tokens`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteToken: (projectId: string, tokenId: string) =>
    apiFetch<{ ok: true }>(`/projects/${projectId}/api-tokens/${tokenId}`, {
      method: 'DELETE',
    }),

  listServiceAccounts: (projectId: string) =>
    apiFetch<ServiceAccountDto[]>(`/projects/${projectId}/service-accounts`),
  createServiceAccount: (
    projectId: string,
    payload: CreateServiceAccountRequest,
  ) =>
    apiFetch<ServiceAccountDto>(`/projects/${projectId}/service-accounts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteServiceAccount: (projectId: string, serviceAccountId: string) =>
    apiFetch<{ ok: true }>(
      `/projects/${projectId}/service-accounts/${serviceAccountId}`,
      { method: 'DELETE' },
    ),
  listServiceAccountTokens: (serviceAccountId: string) =>
    apiFetch<ServiceAccountTokenDto[]>(
      `/service-accounts/${serviceAccountId}/tokens`,
    ),
  createServiceAccountToken: (
    serviceAccountId: string,
    payload: CreateServiceAccountTokenRequest,
  ) =>
    apiFetch<CreateServiceAccountTokenResponse>(
      `/service-accounts/${serviceAccountId}/tokens`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  deleteServiceAccountToken: (serviceAccountId: string, tokenId: string) =>
    apiFetch<{ ok: true }>(
      `/service-accounts/${serviceAccountId}/tokens/${tokenId}`,
      { method: 'DELETE' },
    ),

  listInvites: (projectId: string) =>
    apiFetch<ProjectInviteDto[]>(`/projects/${projectId}/invites`),
  listMembers: (projectId: string) =>
    apiFetch<ProjectMemberDto[]>(`/projects/${projectId}/members`),
  createInvite: (projectId: string, payload: CreateInviteRequest) =>
    apiFetch<CreateInviteResponse>(`/projects/${projectId}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revokeInvite: (projectId: string, inviteId: string) =>
    apiFetch<{ ok: true }>(`/projects/${projectId}/invites/${inviteId}`, {
      method: 'DELETE',
    }),
  acceptInvite: (payload: AcceptInviteRequest) =>
    apiFetch<AcceptInviteResponse>('/invites/accept', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  issueCliLogin: (payload: CliLoginIssueRequest) =>
    apiFetch<CliLoginIssueResponse>('/auth/cli-login/issue', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listApprovalRules: (projectId: string) =>
    apiFetch<ApprovalRuleDto[]>(`/projects/${projectId}/approval-rules`),
  createApprovalRule: (projectId: string, payload: CreateApprovalRuleRequest) =>
    apiFetch<ApprovalRuleDto>(`/projects/${projectId}/approval-rules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateApprovalRule: (ruleId: string, payload: UpdateApprovalRuleRequest) =>
    apiFetch<ApprovalRuleDto>(`/approval-rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteApprovalRule: (ruleId: string) =>
    apiFetch<{ ok: true }>(`/approval-rules/${ruleId}`, { method: 'DELETE' }),
  listApprovals: (
    projectId: string,
    filters?: {
      status?: ApprovalStatus
      environmentId?: string
      action?: ApprovalAction
      requestedBy?: string
    },
  ) => {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.environmentId)
      params.set('environmentId', filters.environmentId)
    if (filters?.action) params.set('action', filters.action)
    if (filters?.requestedBy) params.set('requestedBy', filters.requestedBy)
    const query = params.toString()
    return apiFetch<ApprovalRequestDto[]>(
      `/projects/${projectId}/approvals${query ? `?${query}` : ''}`,
    )
  },
  getApproval: (approvalId: string) =>
    apiFetch<ApprovalRequestDto>(`/approvals/${approvalId}`),
  approveRequest: (approvalId: string) =>
    apiFetch<{ ok: true }>(`/approvals/${approvalId}/approve`, {
      method: 'POST',
    }),
  denyRequest: (approvalId: string) =>
    apiFetch<{ ok: true }>(`/approvals/${approvalId}/deny`, { method: 'POST' }),
  cancelRequest: (approvalId: string) =>
    apiFetch<{ ok: true }>(`/approvals/${approvalId}/cancel`, {
      method: 'POST',
    }),

  listAudit: (projectId: string, filters?: AuditLogFilters) => {
    const params = new URLSearchParams()
    params.set('projectId', projectId)
    if (filters?.start) params.set('start', filters.start)
    if (filters?.end) params.set('end', filters.end)
    if (filters?.action) params.set('action', filters.action)
    if (filters?.resourceType) params.set('resourceType', filters.resourceType)
    if (filters?.resourceId) params.set('resourceId', filters.resourceId)
    if (filters?.actorUserId) params.set('actorUserId', filters.actorUserId)
    if (filters?.actorServiceAccountId)
      params.set('actorServiceAccountId', filters.actorServiceAccountId)
    if (filters?.limit) params.set('limit', String(filters.limit))
    return apiFetch<AuditLogDto[]>(`/audit?${params.toString()}`)
  },
  getAuditRetention: (projectId: string) =>
    apiFetch<AuditRetentionDto>(`/projects/${projectId}/audit-retention`),
  updateAuditRetention: (
    projectId: string,
    payload: { auditRetentionDays: number | null },
  ) =>
    apiFetch<AuditRetentionDto>(`/projects/${projectId}/audit-retention`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
}
