import type {
    AuthClientDto,
    AuthProjectConfigDto,
    AuthProviderDto,
    AuthResponse,
    CliLoginIssueRequest,
    CliLoginIssueResponse,
    CursorPage,
    LoginRequest,
    RegisterRequest,
    UpdateMeRequest,
} from '@secrets/shared'
import { ApiError, type ApiFetchFn } from '../apiBase'
import { betterAuthClient } from '../betterAuthClient'
import { unwrapCursorPage } from '../queryResult'

type ResetCsrfTokenFn = () => void

export const createAuthClient = (
  apiFetch: ApiFetchFn,
  resetCsrfToken: ResetCsrfTokenFn,
) => ({
  getMe: () => apiFetch<AuthResponse>('/me'),
  register: async (payload: RegisterRequest): Promise<AuthResponse> => {
    resetCsrfToken()
    const { error } = await betterAuthClient.signUp.email({
      email: payload.email,
      password: payload.password,
      name: payload.name?.trim() || payload.email.split('@')[0] || 'User',
    })
    if (error) {
      throw new ApiError(error.message || 'Registration failed', error.status || 400)
    }
    return apiFetch<AuthResponse>('/me')
  },
  login: async (payload: LoginRequest): Promise<AuthResponse> => {
    resetCsrfToken()
    const { error } = await betterAuthClient.signIn.email({
      email: payload.email,
      password: payload.password,
    })
    if (error) {
      throw new ApiError(error.message || 'Invalid credentials', error.status || 401)
    }
    return apiFetch<AuthResponse>('/me')
  },
  loginWithPasskey: async (): Promise<AuthResponse> => {
    resetCsrfToken()
    const { error } = await betterAuthClient.signIn.passkey()
    if (error) {
      throw new ApiError(error.message || 'Passkey sign-in failed', error.status || 401)
    }
    return apiFetch<AuthResponse>('/me')
  },
  logout: async () => {
    const { error } = await betterAuthClient.signOut()
    resetCsrfToken()
    if (error) {
      throw new ApiError(error.message || 'Logout failed', error.status || 400)
    }
    return { ok: true as const }
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
  listAuthProviders: async (projectId: string) => {
    const page = await apiFetch<CursorPage<AuthProviderDto>>(
      `/projects/${projectId}/auth/providers`,
    )
    return unwrapCursorPage(page)
  },
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
  listAuthClients: async (projectId: string) => {
    const page = await apiFetch<CursorPage<AuthClientDto>>(
      `/projects/${projectId}/auth/clients`,
    )
    return unwrapCursorPage(page)
  },
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
