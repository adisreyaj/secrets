import type {
  ApiTokenDto,
  AuditLogFilters,
  AuditLogDto,
  AuditRetentionDto,
  CreateInviteRequest,
  CreateInviteResponse,
  CreateEnvironmentRequest,
  DeleteEnvironmentRequest,
  DeleteProjectRequest,
  CreateProjectRequest,
  CreateTokenRequest,
  CreateTokenResponse,
  EnvironmentDto,
  ProjectDto,
  ProjectMemberDto,
  ProjectInviteDto,
  AcceptInviteRequest,
  AcceptInviteResponse,
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
} from '@secrets/shared'
import { apiFetch, resetCsrfToken } from './apiBase'
import { createAuthClient } from './api/authClient'
import { createFlagsClient } from './api/flagsClient'
import { createSecretsClient } from './api/secretsClient'
export { ApiError } from './apiBase'

export const api = {
  ...createAuthClient(apiFetch, resetCsrfToken),

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
  ...createFlagsClient(apiFetch),

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
