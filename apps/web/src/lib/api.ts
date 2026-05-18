import { apiFetch, resetCsrfToken } from './apiBase'
import { createAccessClient } from './api/accessClient'
import { createAuthClient } from './api/authClient'
import { createAuditClient } from './api/auditClient'
import { createProjectsClient } from './api/projectsClient'
import { createSecretsClient } from './api/secretsClient'
export { ApiError } from './apiBase'

export const api = {
  ...createAuthClient(apiFetch, resetCsrfToken),
  ...createProjectsClient(apiFetch),
  ...createAccessClient(apiFetch),
  ...createAuditClient(apiFetch),
  ...createSecretsClient(apiFetch),
}
