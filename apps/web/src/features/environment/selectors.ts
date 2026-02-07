import type { ApprovalRequestDto, EnvironmentDto, SecretDto } from '@secrets/shared'
import type {
  EnvironmentOption,
  PendingBySecretId,
  SecretByKey,
  SecretCoverageIndex,
} from './types'

export const buildEnvironmentOptions = (
  environments: EnvironmentDto[],
): EnvironmentOption[] => environments.map((env) => ({ id: env.id, name: env.name }))

export const buildMissingKeys = (
  secretKeyIndex: SecretCoverageIndex,
  secrets: SecretDto[],
): string[] => {
  const currentKeys = new Set(secrets.map((secret) => secret.key))
  const allKeys = new Set<string>()

  for (const keys of Object.values(secretKeyIndex)) {
    for (const key of keys) {
      allKeys.add(key)
    }
  }

  const missing: string[] = []
  for (const key of allKeys) {
    if (!currentKeys.has(key)) {
      missing.push(key)
    }
  }
  missing.sort((a, b) => a.localeCompare(b))
  return missing
}

export const buildMissingKeysByEnvironment = (
  environments: EnvironmentDto[],
  activeEnvironmentId: string,
  secretKeyIndex: SecretCoverageIndex,
  secrets: SecretDto[],
): Record<string, string[]> => {
  const currentKeys = new Set(secrets.map((secret) => secret.key))
  const map: Record<string, string[]> = {}

  for (const env of environments) {
    if (env.id === activeEnvironmentId) continue
    const keys = secretKeyIndex[env.id] ?? []
    const candidates = keys.filter((key) => !currentKeys.has(key))
    if (candidates.length > 0) {
      map[env.id] = candidates.sort((a, b) => a.localeCompare(b))
    }
  }

  return map
}

export const buildSecretByKey = (secrets: SecretDto[]): SecretByKey => {
  const map = new Map<string, SecretDto>()
  for (const secret of secrets) {
    map.set(secret.key, secret)
  }
  return map
}

export const buildPendingBySecretId = (
  approvals: ApprovalRequestDto[],
): PendingBySecretId => {
  const map = new Map<string, ApprovalRequestDto>()
  for (const approval of approvals) {
    if (approval.secretId) {
      map.set(approval.secretId, approval)
    }
  }
  return map
}
