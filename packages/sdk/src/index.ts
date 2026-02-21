import fs from 'node:fs/promises'
import path from 'node:path'

export const CONFIG_FILENAME = '.secretsrc.json'
const DEFAULT_BASE_URL = 'https://secrets.api.adi.so';

export interface SecretsConfigFile {
  apiBaseUrl?: string
  projectId?: string
  projectSlug?: string
  environmentId?: string
  environmentSlug?: string
}

export interface SecretsClientOptions {
  baseUrl?: string
  token: string
  projectId?: string
  projectSlug?: string
  environmentId?: string
  environmentSlug?: string
  cacheTtlMs?: number
}

export interface SecretsClient {
  getSecret: (key: string) => Promise<string | undefined>
  getSecrets: () => Promise<Record<string, string>>
  injectProcessEnv: (options?: { override?: boolean }) => Promise<Record<string, string>>
  resolveEnvironmentId: () => Promise<string>
}

export type FlagEvaluationReason =
  | 'flag_not_configured'
  | 'runtime_not_allowed'
  | 'boolean_value'
  | 'multivariate_default'
  | 'multivariate_missing_default'
  | 'override_disabled'
  | 'override_variant'
  | 'override_enabled'
  | 'flag_disabled'
  | 'rule_disabled'
  | 'rule_enabled'
  | 'weighted_variant'
  | 'default_boolean'
  | 'default_multivariate_disabled'

export interface FeatureFlagRuntimeEvaluation {
  flagKey: string
  projectId: string
  environmentId: string
  enabled: boolean
  variantKey?: string
  variantValue?: string
  reason: FlagEvaluationReason
}

export interface FeatureFlagRuntimeBatchEvaluation {
  projectId: string
  environmentId: string
  subjectKey: string
  results: FeatureFlagRuntimeEvaluation[]
}

export interface FeatureFlagRuntimeClientOptions {
  baseUrl?: string
  sdkKey: string
  fetch?: typeof fetch
}

export interface FeatureFlagRuntimeClient {
  evaluate: (input: {
    environmentId: string
    flagKey: string
    subjectKey: string
  }) => Promise<FeatureFlagRuntimeEvaluation>
  evaluateBatch: (input: {
    environmentId: string
    subjectKey: string
    flagKeys?: string[]
  }) => Promise<FeatureFlagRuntimeBatchEvaluation>
  isEnabled: (input: {
    environmentId: string
    flagKey: string
    subjectKey: string
  }) => Promise<boolean>
  getVariant: (input: {
    environmentId: string
    flagKey: string
    subjectKey: string
  }) => Promise<{ key?: string; value?: string; enabled: boolean }>
}

async function apiFetch<T>(
  baseUrl: string,
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const payload = await response.json()
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // ignore
    }
    throw new Error(`Secrets API error: ${message}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}

async function runtimeFetch<T>(
  baseUrl: string,
  sdkKey: string,
  path: string,
  body: unknown,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sdkKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const payload = await response.json()
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // ignore
    }
    throw new Error(`Feature flags runtime API error: ${message}`)
  }

  return (await response.json()) as T
}

function isProbablyId(value: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(value)
}

export async function readConfigFile(
  configPath: string = path.join(process.cwd(), CONFIG_FILENAME),
): Promise<SecretsConfigFile | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as SecretsConfigFile
    return parsed
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function resolveProjectId(
  baseUrl: string,
  token: string,
  projectId?: string,
  projectSlug?: string,
): Promise<string | undefined> {
  if (projectId) {
    return projectId
  }
  if (!projectSlug) {
    return undefined
  }
  const project = await apiFetch<{ id: string }>(baseUrl, token, `/projects/slug/${projectSlug}`)
  return project.id
}

async function resolveEnvironmentId(
  baseUrl: string,
  token: string,
  envId?: string,
  envSlug?: string,
  projectId?: string,
  projectSlug?: string,
): Promise<string> {
  if (envId) {
    return envId
  }
  if (!envSlug) {
    throw new Error('Environment ID or slug is required')
  }

  const resolvedProjectId = await resolveProjectId(baseUrl, token, projectId, projectSlug)
  if (!resolvedProjectId) {
    throw new Error('Project ID or slug is required when environment is a slug')
  }

  const env = await apiFetch<{ id: string }>(
    baseUrl,
    token,
    `/projects/${resolvedProjectId}/environments/slug/${envSlug}`,
  )
  return env.id
}

export async function fromConfigFile(options: {
  token: string
  configPath?: string
  cacheTtlMs?: number
}): Promise<SecretsClient> {
  const config = await readConfigFile(options.configPath)
  if (!config) {
    throw new Error(`Config file not found. Expected ${CONFIG_FILENAME} in the current directory.`)
  }

  return createClient({
    baseUrl: config.apiBaseUrl,
    token: options.token,
    projectId: config.projectId,
    projectSlug: config.projectSlug,
    environmentId: config.environmentId,
    environmentSlug: config.environmentSlug,
    cacheTtlMs: options.cacheTtlMs,
  })
}

export function createClient(options: SecretsClientOptions): SecretsClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const cacheTtlMs = options.cacheTtlMs ?? 0
  let cache:
    | {
        fetchedAt: number
        data: Record<string, string>
      }
    | undefined

  const resolveEnvId = async () =>
    resolveEnvironmentId(
      baseUrl,
      options.token,
      options.environmentId,
      options.environmentSlug,
      options.projectId,
      options.projectSlug,
    )

  const getSecrets = async () => {
    if (cache && cacheTtlMs > 0 && Date.now() - cache.fetchedAt < cacheTtlMs) {
      return cache.data
    }

    const envId = await resolveEnvId()
    const secrets = await apiFetch<
      { key: string; value?: string }[]
    >(baseUrl, options.token, `/environments/${envId}/secrets?includeValues=true`)

    const data: Record<string, string> = {}
    for (const secret of secrets) {
      if (typeof secret.value === 'string') {
        data[secret.key] = secret.value
      }
    }

    cache = { fetchedAt: Date.now(), data }
    return data
  }

  const getSecret = async (key: string) => {
    const data = await getSecrets()
    return data[key]
  }

  const injectProcessEnv = async (opts?: { override?: boolean }) => {
    const data = await getSecrets()
    const override = opts?.override === true
    for (const [key, value] of Object.entries(data)) {
      if (!override && typeof process.env[key] !== 'undefined') {
        continue
      }
      process.env[key] = value
    }
    return data
  }

  return {
    getSecret,
    getSecrets,
    injectProcessEnv,
    resolveEnvironmentId: resolveEnvId,
  }
}

export function createFeatureFlagRuntimeClient(
  options: FeatureFlagRuntimeClientOptions,
): FeatureFlagRuntimeClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetcher = options.fetch ?? globalThis.fetch
  if (!fetcher) {
    throw new Error('A fetch implementation is required')
  }

  const evaluate: FeatureFlagRuntimeClient['evaluate'] = async (input) =>
    runtimeFetch<FeatureFlagRuntimeEvaluation>(
      baseUrl,
      options.sdkKey,
      '/runtime/flags/evaluate',
      input,
      fetcher,
    )

  const evaluateBatch: FeatureFlagRuntimeClient['evaluateBatch'] = async (
    input,
  ) =>
    runtimeFetch<FeatureFlagRuntimeBatchEvaluation>(
      baseUrl,
      options.sdkKey,
      '/runtime/flags/evaluate/batch',
      input,
      fetcher,
    )

  const isEnabled: FeatureFlagRuntimeClient['isEnabled'] = async (input) => {
    const evaluation = await evaluate(input)
    return evaluation.enabled
  }

  const getVariant: FeatureFlagRuntimeClient['getVariant'] = async (input) => {
    const evaluation = await evaluate(input)
    return {
      enabled: evaluation.enabled,
      key: evaluation.variantKey,
      value: evaluation.variantValue,
    }
  }

  return {
    evaluate,
    evaluateBatch,
    isEnabled,
    getVariant,
  }
}

export function normalizeConfigInput(
  envValue?: string,
  configValue?: string,
): { id?: string; slug?: string } {
  const value = envValue ?? configValue
  if (!value) {
    return {}
  }
  if (isProbablyId(value)) {
    return { id: value }
  }
  return { slug: value }
}
