import type {
  ApprovalRequestResponse,
  BulkImportRequest,
  BulkImportResponse,
  CopyEnvironmentSecretsRequest,
  CopyEnvironmentSecretsResponse,
  CopySecretRequest,
  CopySecretResponse,
  SecretDiffResponse,
  SecretDto,
  SecretSearchResultDto,
  SecretVersionDto,
  UpdateSecretRequest,
} from '@secrets/shared'
import type { ApiFetchFn } from '../apiBase'

export const createSecretsClient = (apiFetch: ApiFetchFn) => ({
  listSecrets: (environmentId: string, includeValues: boolean) =>
    apiFetch<SecretDto[]>(
      `/environments/${environmentId}/secrets?includeValues=${includeValues}`,
    ),
  createSecret: (
    environmentId: string,
    payload: { key: string; value: string },
  ) =>
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
})
