import type {
  AuditLogFilters,
  AuditLogDto,
  AuditRetentionDto,
} from '@secrets/shared'
import { apiFetch, resetCsrfToken } from './apiBase'
import { createAccessClient } from './api/accessClient'
import { createApprovalsClient } from './api/approvalsClient'
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
  ...createApprovalsClient(apiFetch),
  ...createSecretsClient(apiFetch),

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
