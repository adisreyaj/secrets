import type {
  ApprovalRequestDto,
  EnvironmentDto,
  SecretDto,
} from '@secrets/shared'

export type SecretCoverageIndex = Record<string, string[]>

export type SecretByKey = Map<string, SecretDto>

export type PendingBySecretId = Map<string, ApprovalRequestDto>

export type EnvironmentOption = Pick<EnvironmentDto, 'id' | 'name'>
