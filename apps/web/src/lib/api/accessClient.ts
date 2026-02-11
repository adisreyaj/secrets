import type {
  ApiTokenDto,
  CreateServiceAccountRequest,
  CreateServiceAccountTokenRequest,
  CreateServiceAccountTokenResponse,
  CreateTokenRequest,
  CreateTokenResponse,
  ServiceAccountDto,
  ServiceAccountTokenDto,
} from '@secrets/shared'
import type { ApiFetchFn } from '../apiBase'

export const createAccessClient = (apiFetch: ApiFetchFn) => ({
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
})
