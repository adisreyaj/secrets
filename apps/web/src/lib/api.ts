import { apiFetch, resetCsrfToken } from './apiBase'
import { createAccessClient } from './api/accessClient'
import { createApprovalsClient } from './api/approvalsClient'
import { createAuthClient } from './api/authClient'
import { createAuditClient } from './api/auditClient'
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
  ...createAuditClient(apiFetch),
  ...createSecretsClient(apiFetch),
}
