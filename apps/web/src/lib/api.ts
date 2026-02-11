import type {
  AuditLogFilters,
  AuditLogDto,
  AuditRetentionDto,
  ApprovalRuleDto,
  ApprovalRequestDto,
  CreateApprovalRuleRequest,
  UpdateApprovalRuleRequest,
  ApprovalStatus,
  ApprovalAction,
} from '@secrets/shared'
import { apiFetch, resetCsrfToken } from './apiBase'
import { createAccessClient } from './api/accessClient'
import { createAuthClient } from './api/authClient'
import { createFlagsClient } from './api/flagsClient'
import { createProjectsClient } from './api/projectsClient'
import { createSecretsClient } from './api/secretsClient'
export { ApiError } from './apiBase'

export const api = {
  ...createAuthClient(apiFetch, resetCsrfToken),
  ...createProjectsClient(apiFetch),
  ...createFlagsClient(apiFetch),
  ...createAccessClient(apiFetch),
  ...createSecretsClient(apiFetch),

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
