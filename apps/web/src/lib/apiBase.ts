const API_BASE = import.meta.env.VITE_API_URL ?? ''
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let csrfTokenCache: string | null = null
let csrfTokenRequest: Promise<string | null> | null = null

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const resetCsrfToken = () => {
  csrfTokenCache = null
}

const getCookie = (name: string) => {
  if (typeof document === 'undefined') {
    return undefined
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

const getCsrfTokenFromServer = async (): Promise<string | null> => {
  if (csrfTokenRequest) return csrfTokenRequest

  csrfTokenRequest = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/csrf`, {
        method: 'GET',
        credentials: 'include',
      })
      if (!response.ok) return null
      const data = (await response.json()) as { csrfToken?: string }
      return data.csrfToken ?? null
    } catch {
      return null
    } finally {
      csrfTokenRequest = null
    }
  })()

  return csrfTokenRequest
}

const ensureCsrfHeader = async (headers: Headers, method: string) => {
  if (!WRITE_METHODS.has(method.toUpperCase()) || headers.has('X-CSRF-Token')) {
    return
  }

  const cookieToken = getCookie('sm_csrf')
  if (cookieToken) {
    csrfTokenCache = cookieToken
    headers.set('X-CSRF-Token', cookieToken)
    return
  }

  const token = csrfTokenCache ?? (await getCsrfTokenFromServer())
  if (token) {
    csrfTokenCache = token
    headers.set('X-CSRF-Token', token)
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  const method = options.method ?? 'GET'
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  await ensureCsrfHeader(headers, method)

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
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
