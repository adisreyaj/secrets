import type { DebugLogger } from '../log.js'
import { ApiError, CliError } from '../core/errors.js'

function parseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const error = (payload as { error?: unknown }).error
  return typeof error === 'string' ? error : fallback
}

async function parsePayload(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function apiFetch<T>(
  baseUrl: string,
  token: string,
  route: string,
  debug: DebugLogger,
): Promise<T> {
  const method = 'GET'
  const url = `${baseUrl}${route}`
  debug('http.request', { method, url })

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (error) {
    debug('http.network_error', { method, url, error: error instanceof Error ? error.message : String(error) })
    throw new CliError('NETWORK_ERROR', 'fetch failed')
  }

  if (!response.ok) {
    const payload = await parsePayload(response)
    const message = parseMessage(payload, response.statusText)
    throw new ApiError(response.status, message, route, method)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}

export async function apiRequest<T>(
  baseUrl: string,
  token: string,
  route: string,
  options: RequestInit,
  debug: DebugLogger,
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const url = `${baseUrl}${route}`
  debug('http.request', { method, url })

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers,
    })
  } catch (error) {
    debug('http.network_error', { method, url, error: error instanceof Error ? error.message : String(error) })
    throw new CliError('NETWORK_ERROR', 'fetch failed')
  }

  if (!response.ok) {
    const payload = await parsePayload(response)
    const message = parseMessage(payload, response.statusText)
    throw new ApiError(response.status, message, route, method)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}

export async function createEnvironment(
  baseUrl: string,
  token: string,
  projectId: string,
  envName: string,
  debug: DebugLogger,
) {
  try {
    return await apiRequest<{ id: string; slug?: string | null }>(
      baseUrl,
      token,
      `/projects/${projectId}/environments`,
      {
        method: 'POST',
        body: JSON.stringify({ name: envName }),
      },
      debug,
    )
  } catch (error) {
    const err = error as ApiError
    if (err instanceof ApiError && err.status === 403) {
      throw new CliError(
        'FORBIDDEN',
        'Cannot create environment with this token. This usually means you are using a global bootstrap CLI token.',
        {
          hint: 'Run `secrets login` and issue a project-scoped CLI token for this project.',
        },
      )
    }
    throw error
  }
}
