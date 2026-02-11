import type {
  AuthResponse,
  CliLoginIssueRequest,
  CliLoginIssueResponse,
  LoginRequest,
  RegisterRequest,
  UpdateMeRequest,
  AuthProjectConfigDto,
  AuthProviderDto,
  AuthClientDto,
} from '@secrets/shared'
import type { ApiFetchFn } from '../apiBase'

type ResetCsrfTokenFn = () => void

export const createAuthClient = (
  apiFetch: ApiFetchFn,
  resetCsrfToken: ResetCsrfTokenFn,
) => ({
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
  issueCliLogin: (payload: CliLoginIssueRequest) =>
    apiFetch<CliLoginIssueResponse>('/auth/cli-login/issue', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
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
})
