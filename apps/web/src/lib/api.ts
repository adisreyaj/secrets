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
  CreateProjectRequest,
  CreateSecretRequest,
  CreateTokenRequest,
  CreateTokenResponse,
  CopySecretRequest,
  CopySecretResponse,
  CopyEnvironmentSecretsRequest,
  CopyEnvironmentSecretsResponse,
  EnvironmentDto,
  LoginRequest,
  ProjectDto,
  ProjectMemberDto,
  ProjectInviteDto,
  RegisterRequest,
  SecretDto,
  SecretDiffResponse,
  SecretVersionDto,
  SecretSearchResultDto,
  AcceptInviteRequest,
  AcceptInviteResponse,
  BulkImportRequest,
  BulkImportResponse,
  UpdateMeRequest,
  UpdateSecretRequest,
  ApprovalRuleDto,
  ApprovalRequestDto,
  ApprovalRequestResponse,
  CreateApprovalRuleRequest,
  UpdateApprovalRuleRequest,
  ApprovalStatus,
  ApprovalAction,
  ServiceAccountDto,
  ServiceAccountTokenDto,
  CreateServiceAccountRequest,
  CreateServiceAccountTokenRequest,
  CreateServiceAccountTokenResponse,
} from '@secrets/shared'

const API_BASE = import.meta.env.VITE_API_URL ?? ''
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
let csrfTokenCache: string | null = null
let csrfTokenRequest: Promise<string | null> | null = null

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const getCookie = (name: string) => {
  if (typeof document === 'undefined') {
    return undefined
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

const getCsrfTokenFromServer = async (): Promise<string | null> => {
  if (csrfTokenRequest) return csrfTokenRequest

  csrfTokenRequest = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/csrf`, {
        method: 'GET',
        credentials: 'include',
      })
      if (!response.ok) return null
      const data = (await response.json()) as { csrfToken?: string }
      return data.csrfToken ?? null
    } catch {
      return null
    } finally {
      csrfTokenRequest = null
    }
  })()

  return csrfTokenRequest
}

const ensureCsrfHeader = async (headers: Headers, method: string) => {
  if (!WRITE_METHODS.has(method.toUpperCase()) || headers.has('X-CSRF-Token')) {
    return
  }

  const cookieToken = getCookie('sm_csrf')
  if (cookieToken) {
    csrfTokenCache = cookieToken
    headers.set('X-CSRF-Token', cookieToken)
    return
  }

  const token = csrfTokenCache ?? (await getCsrfTokenFromServer())
  if (token) {
    csrfTokenCache = token
    headers.set('X-CSRF-Token', token)
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  const method = options.method ?? 'GET'
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  await ensureCsrfHeader(headers, method)

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const data = await response.json()
      if (data?.error) {
        message = data.error
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  return (await response.text()) as T
}

export const api = {
  getMe: () => apiFetch<AuthResponse>('/me'),
  register: async (payload: RegisterRequest) => {
    csrfTokenCache = null
    return apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  login: async (payload: LoginRequest) => {
    csrfTokenCache = null
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  logout: async () => {
    const result = await apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' })
    csrfTokenCache = null
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
  getProjectBySlug: (slug: string) =>
    apiFetch<ProjectDto>(`/projects/slug/${slug}`),

  listEnvironments: (projectId: string) =>
    apiFetch<EnvironmentDto[]>(`/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, payload: CreateEnvironmentRequest) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getEnvironmentBySlug: (projectId: string, slug: string) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments/slug/${slug}`),

  listSecrets: (environmentId: string, includeValues: boolean) =>
    apiFetch<SecretDto[]>(
      `/environments/${environmentId}/secrets?includeValues=${includeValues}`,
    ),
  createSecret: (environmentId: string, payload: CreateSecretRequest) =>
    apiFetch<{ id: string } | ApprovalRequestResponse>(
      `/environments/${environmentId}/secrets`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  bulkImportSecrets: (environmentId: string, payload: BulkImportRequest) =>
    apiFetch<BulkImportResponse>(
      `/environments/${environmentId}/secrets/bulk`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  updateSecret: (secretId: string, payload: UpdateSecretRequest) =>
    apiFetch<{ ok: true } | ApprovalRequestResponse>(`/secrets/${secretId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  rollbackSecret: (secretId: string, versionId?: string) =>
    apiFetch<{ ok: true } | ApprovalRequestResponse>(
      `/secrets/${secretId}/rollback`,
      {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      },
    ),
  deleteSecret: (secretId: string) =>
    apiFetch<{ ok: true } | ApprovalRequestResponse>(`/secrets/${secretId}`, {
      method: 'DELETE',
    }),
  copySecret: (secretId: string, payload: CopySecretRequest) =>
    apiFetch<CopySecretResponse | ApprovalRequestResponse>(
      `/secrets/${secretId}/copy`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  copySecretsFromEnvironment: (
    environmentId: string,
    payload: CopyEnvironmentSecretsRequest,
  ) =>
    apiFetch<CopyEnvironmentSecretsResponse | ApprovalRequestResponse>(
      `/environments/${environmentId}/secrets/copy-from`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  searchProjectSecrets: (
    projectId: string,
    payload: {
      query: string
      environmentId?: string | null
      includeValues?: boolean
    },
  ) => {
    const params = new URLSearchParams({ q: payload.query })
    if (payload.environmentId)
      params.set('environmentId', payload.environmentId)
    if (payload.includeValues) params.set('includeValues', 'true')
    return apiFetch<SecretSearchResultDto[]>(
      `/projects/${projectId}/secrets/search?${params.toString()}`,
    )
  },

  exportEnv: (environmentId: string) =>
    apiFetch<string>(`/environments/${environmentId}/export?format=dotenv`),

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

  getSecretDiff: (
    secretId: string,
    versions?: { from?: string; to?: string },
  ) => {
    const params = new URLSearchParams({ secretId })
    if (versions?.from) params.set('from', versions.from)
    if (versions?.to) params.set('to', versions.to)
    return apiFetch<SecretDiffResponse>(`/secrets/diff?${params.toString()}`)
  },
  listSecretVersions: (secretId: string) =>
    apiFetch<SecretVersionDto[]>(`/secrets/${secretId}/versions`),

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
