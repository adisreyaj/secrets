import type { DebugLogger } from '../log.js'

export type StoredAuth = {
  token: string
  baseUrl: string
  updatedAt: string
}

export type FlagOptions = {
  env?: string
  project?: string
  baseUrl?: string
  format?: string
  out?: string
  override?: boolean
  dryRun?: boolean
  force?: boolean
  debug?: boolean
  yes?: boolean
  json?: boolean
  projectName?: string
  envName?: string
}

export type CommandContext = {
  flags: FlagOptions
  debug: DebugLogger
}

export type LoadClientResult = {
  client: {
    getSecrets: () => Promise<Record<string, string>>
    getSecret: (key: string) => Promise<string | undefined>
    resolveEnvironmentId: () => Promise<string>
  }
  baseUrl: string
  token: string
}
