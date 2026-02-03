import type {
  ApiTokenDto,
  AuditLogDto,
  AuthResponse,
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
  RegisterRequest,
  SecretDto,
  UpdateSecretRequest,
} from '@secrets/shared'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
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
  register: (payload: RegisterRequest) =>
    apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (payload: LoginRequest) =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),

  listProjects: () => apiFetch<ProjectDto[]>('/projects'),
  createProject: (payload: CreateProjectRequest) =>
    apiFetch<ProjectDto>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listEnvironments: (projectId: string) =>
    apiFetch<EnvironmentDto[]>(`/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, payload: CreateEnvironmentRequest) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listSecrets: (environmentId: string, includeValues: boolean) =>
    apiFetch<SecretDto[]>(
      `/environments/${environmentId}/secrets?includeValues=${includeValues}`,
    ),
  createSecret: (environmentId: string, payload: CreateSecretRequest) =>
    apiFetch<{ id: string }>(`/environments/${environmentId}/secrets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSecret: (secretId: string, payload: UpdateSecretRequest) =>
    apiFetch<{ ok: true }>(`/secrets/${secretId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  rollbackSecret: (secretId: string, versionId?: string) =>
    apiFetch<{ ok: true }>(`/secrets/${secretId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  deleteSecret: (secretId: string) =>
    apiFetch<{ ok: true }>(`/secrets/${secretId}`, { method: 'DELETE' }),
  copySecret: (secretId: string, payload: CopySecretRequest) =>
    apiFetch<CopySecretResponse>(`/secrets/${secretId}/copy`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  copySecretsFromEnvironment: (environmentId: string, payload: CopyEnvironmentSecretsRequest) =>
    apiFetch<CopyEnvironmentSecretsResponse>(`/environments/${environmentId}/secrets/copy-from`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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

  listAudit: (projectId: string) =>
    apiFetch<AuditLogDto[]>(`/audit?projectId=${projectId}`),
}
