import { CONFIG_FILENAME, createClient, normalizeConfigInput, readConfigFile } from '@secrets/sdk'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { CliError } from './errors.js'
import type { FlagOptions, LoadClientResult, StoredAuth } from './types.js'

const DEFAULT_BASE_URL = 'https://secrets.api.adi.so'
const AUTH_DIR = path.join(os.homedir(), '.config', 'secrets')
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json')

export { CONFIG_FILENAME, AUTH_FILE }

export async function readStoredAuth(): Promise<StoredAuth | null> {
  try {
    const raw = await fs.readFile(AUTH_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as StoredAuth
    if (!parsed.token || !parsed.baseUrl) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function persistAuth(token: string, baseUrl: string) {
  await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 })
  await fs.writeFile(
    AUTH_FILE,
    JSON.stringify(
      {
        token,
        baseUrl,
        updatedAt: new Date().toISOString(),
      } satisfies StoredAuth,
      null,
      2,
    ),
    { mode: 0o600 },
  )
}

export async function resolveBaseUrl(flags: FlagOptions) {
  const config = await readConfigFile()
  const storedAuth = await readStoredAuth()
  return (
    flags.baseUrl ??
    process.env.SECRETS_API_BASE_URL ??
    config?.apiBaseUrl ??
    storedAuth?.baseUrl ??
    DEFAULT_BASE_URL
  )
}

export async function loadClient(flags: FlagOptions): Promise<LoadClientResult> {
  const config = await readConfigFile()
  const storedAuth = await readStoredAuth()
  const token = process.env.SECRETS_TOKEN ?? storedAuth?.token
  if (!token) {
    throw new CliError('AUTH_ERROR', 'Missing SECRETS_TOKEN. Run `secrets login` or set the env var.')
  }

  const baseUrl =
    flags.baseUrl ??
    process.env.SECRETS_API_BASE_URL ??
    config?.apiBaseUrl ??
    storedAuth?.baseUrl ??
    DEFAULT_BASE_URL

  const envInput = flags.env ?? process.env.SECRETS_ENV
  const projectInput = flags.project ?? process.env.SECRETS_PROJECT

  const envSelection = normalizeConfigInput(
    envInput,
    config?.environmentId ?? config?.environmentSlug,
  )
  const projectSelection = normalizeConfigInput(
    projectInput,
    config?.projectId ?? config?.projectSlug,
  )

  if (!envSelection.id && !envSelection.slug) {
    throw new CliError(
      'USAGE_ERROR',
      'Missing SECRETS_ENV (or environment in config). Run `secrets init` or set SECRETS_ENV.',
    )
  }

  return {
    client: createClient({
      baseUrl,
      token,
      environmentId: envSelection.id,
      environmentSlug: envSelection.slug,
      projectId: projectSelection.id,
      projectSlug: projectSelection.slug,
    }),
    baseUrl,
    token,
  }
}
