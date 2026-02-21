import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '../src/auth.js'

type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

type Flag = {
  id: string
  projectId: string
  key: string
  name: string
  description: string | null
  valueType: 'BOOLEAN' | 'JSON'
  enabled: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

type EnvironmentConfig = {
  id: string
  flagId: string
  environmentId: string
  enabled: boolean
  valueType: 'BOOLEAN' | 'JSON'
  booleanValue: boolean | null
  jsonValue: unknown | null
  runtime: 'BOTH' | 'CLIENT' | 'SERVER'
  labelsJson: string[]
  createdAt: Date
  updatedAt: Date
}

type SdkKey = {
  id: string
  projectId: string
  name: string
  keyPrefix: string
  tokenHash: string
  createdBy: string
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
}

const state = {
  apiToken: null as
    | {
        id: string
        tokenHash: string
        projectId: string
        createdBy: string
        readOnly: boolean
        creator: { id: string; email: string; name: string }
      }
    | null,
  role: 'ADMIN' as Role,
  environments: [
    { id: 'env_1', projectId: 'project_1', name: 'Production', createdAt: new Date('2026-01-01') },
    { id: 'env_2', projectId: 'project_1', name: 'Staging', createdAt: new Date('2026-01-02') },
  ],
  flags: [] as Flag[],
  environmentConfigs: [] as EnvironmentConfig[],
  sdkKeys: [] as SdkKey[],
}

function nextId(prefix: string, collectionSize: number): string {
  return `${prefix}_${collectionSize + 1}`
}

vi.mock('../src/db.js', () => ({
  prisma: {
    userSession: { findFirst: async () => null },
    apiToken: {
      findFirst: async ({ where }: { where: { tokenHash?: string } }) =>
        state.apiToken && where?.tokenHash === state.apiToken.tokenHash
          ? state.apiToken
          : null,
      update: async () => ({ id: state.apiToken?.id ?? 'token_1' }),
    },
    serviceAccountToken: { findFirst: async () => null },
    globalCliToken: { findFirst: async () => null },
    projectMember: {
      findUnique: async () => ({ role: state.role }),
    },
    auditLog: {
      create: async () => ({ id: 'audit_1' }),
    },
    approvalRule: {
      findMany: async () => [],
    },
    approvalRequest: {
      findFirst: async () => null,
      create: async () => ({ id: 'approval_1' }),
    },
    featureFlag: {
      findMany: async ({ where, select, include }: any) => {
        const filtered = state.flags.filter((flag) => {
          if (where?.deletedAt === null && flag.deletedAt !== null) return false
          if (where?.projectId && flag.projectId !== where.projectId) return false
          if (where?.key?.in && !where.key.in.includes(flag.key)) return false
          if (where?.NOT?.id && flag.id === where.NOT.id) return false
          return true
        })
        if (select?.key) {
          return filtered.map((flag) => ({ key: flag.key }))
        }
        if (!include) {
          return filtered
        }
        return filtered.map((flag) => ({
          ...flag,
          environmentConfigs: state.environmentConfigs
            .filter(
              (config) =>
                config.flagId === flag.id &&
                (!include.environmentConfigs?.where?.environmentId ||
                  config.environmentId === include.environmentConfigs.where.environmentId),
            ),
          rules: [],
          envOverrides: [],
        }))
      },
      findFirst: async ({ where, include }: any) => {
        const found = state.flags.find((flag) => {
          if (where?.id && flag.id !== where.id) return false
          if (where?.projectId && flag.projectId !== where.projectId) return false
          if (where?.deletedAt === null && flag.deletedAt !== null) return false
          return true
        })
        if (!found) return null
        if (!include) return found
        return {
          ...found,
          environmentConfigs: state.environmentConfigs
            .filter(
              (config) =>
                config.flagId === found.id &&
                (!include.environmentConfigs?.where?.environmentId ||
                  config.environmentId === include.environmentConfigs.where.environmentId),
            ),
        }
      },
      create: async ({ data }: any) => {
        const now = new Date()
        const created: Flag = {
          id: nextId('flag', state.flags.length),
          projectId: data.projectId,
          key: data.key,
          name: data.name,
          description: data.description ?? null,
          valueType: data.valueType,
          enabled: data.enabled,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
        state.flags.push(created)
        return created
      },
      update: async ({ where, data }: any) => {
        const found = state.flags.find((flag) => flag.id === where.id)
        if (!found) throw new Error('Flag not found')
        if (typeof data.key !== 'undefined') found.key = data.key
        if (typeof data.name !== 'undefined') found.name = data.name
        if (Object.prototype.hasOwnProperty.call(data, 'description')) {
          found.description = data.description ?? null
        }
        if (typeof data.valueType !== 'undefined') {
          found.valueType = data.valueType
        }
        if (typeof data.enabled !== 'undefined') found.enabled = data.enabled
        found.updatedAt = new Date()
        return found
      },
    },
    featureFlagEnvironmentConfig: {
      upsert: async ({ where, create, update }: any) => {
        const existing = state.environmentConfigs.find(
          (config) =>
            config.flagId === where.flagId_environmentId.flagId &&
            config.environmentId === where.flagId_environmentId.environmentId,
        )
        if (existing) {
          existing.enabled = update.enabled
          existing.valueType = update.valueType
          existing.booleanValue = update.booleanValue ?? null
          existing.jsonValue = update.jsonValue ?? null
          existing.runtime = update.runtime
          existing.labelsJson = update.labelsJson ?? []
          existing.updatedAt = new Date()
          return existing
        }
        const now = new Date()
        const created: EnvironmentConfig = {
          id: nextId('ffc', state.environmentConfigs.length),
          flagId: create.flagId,
          environmentId: create.environmentId,
          enabled: create.enabled,
          valueType: create.valueType,
          booleanValue: create.booleanValue ?? null,
          jsonValue: create.jsonValue ?? null,
          runtime: create.runtime,
          labelsJson: create.labelsJson ?? [],
          createdAt: now,
          updatedAt: now,
        }
        state.environmentConfigs.push(created)
        return created
      },
      findUnique: async ({ where, include }: any) => {
        let config: EnvironmentConfig | null = null
        if (where?.id) {
          config =
            state.environmentConfigs.find((item) => item.id === where.id) ?? null
        } else if (where?.flagId_environmentId) {
          config =
            state.environmentConfigs.find(
              (item) =>
                item.flagId === where.flagId_environmentId.flagId &&
                item.environmentId === where.flagId_environmentId.environmentId,
            ) ?? null
        }
        if (!config) return null
        return config
      },
    },
    environment: {
      findUnique: async ({ where }: any) =>
        state.environments.find((environment) => environment.id === where.id) ?? null,
      findMany: async ({ where }: any) =>
        state.environments.filter(
          (environment) => environment.projectId === where.projectId,
        ),
    },
    featureFlagSdkKey: {
      create: async ({ data }: any) => {
        const created: SdkKey = {
          id: nextId('sdk', state.sdkKeys.length),
          projectId: data.projectId,
          name: data.name,
          keyPrefix: data.keyPrefix,
          tokenHash: data.tokenHash,
          createdBy: data.createdBy,
          createdAt: new Date(),
          lastUsedAt: null,
          expiresAt: data.expiresAt ?? null,
          revokedAt: null,
        }
        state.sdkKeys.push(created)
        return created
      },
      findFirst: async ({ where }: any) =>
        state.sdkKeys.find((key) => {
          if (where?.tokenHash && key.tokenHash !== where.tokenHash) return false
          if (where?.revokedAt === null && key.revokedAt !== null) return false
          if (where?.OR?.length) {
            const now = new Date()
            return where.OR.some((item: any) => {
              if (item.expiresAt === null) return key.expiresAt === null
              if (item.expiresAt?.gt) return key.expiresAt === null || key.expiresAt > now
              return false
            })
          }
          return true
        }) ?? null,
      findMany: async ({ where }: any) =>
        state.sdkKeys.filter(
          (key) => key.projectId === where.projectId && key.revokedAt === where.revokedAt,
        ),
      findUnique: async ({ where }: any) =>
        state.sdkKeys.find((key) => key.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const key = state.sdkKeys.find((candidate) => candidate.id === where.id)
        if (!key) {
          throw new Error('SDK key not found')
        }
        if (Object.prototype.hasOwnProperty.call(data, 'lastUsedAt')) {
          key.lastUsedAt = data.lastUsedAt
        }
        if (Object.prototype.hasOwnProperty.call(data, 'tokenHash')) {
          key.tokenHash = data.tokenHash
        }
        if (Object.prototype.hasOwnProperty.call(data, 'keyPrefix')) {
          key.keyPrefix = data.keyPrefix
        }
        if (Object.prototype.hasOwnProperty.call(data, 'revokedAt')) {
          key.revokedAt = data.revokedAt
        }
        return key
      },
    },
    featureFlagChangeHistory: {
      create: async () => ({ id: 'history_1' }),
    },
  },
}))

import { buildApp } from '../src/app.js'
import { createFeatureFlagRuntimeClient } from '../../../packages/sdk/src/index.js'

describe('feature flags integration flow', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex')
  })

  beforeEach(() => {
    state.flags = []
    state.environmentConfigs = []
    state.sdkKeys = []
    state.role = 'ADMIN'
    state.apiToken = {
      id: 'token_1',
      tokenHash: hashToken('mgmt-token'),
      projectId: 'project_1',
      createdBy: 'user_1',
      readOnly: false,
      creator: { id: 'user_1', email: 'owner@example.com', name: 'Owner' },
    }
  })

  it('covers create -> update -> runtime SDK evaluation', async () => {
    const app = await buildApp()
    const authHeaders = { authorization: 'Bearer mgmt-token' }

    const flagResponse = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers: authHeaders,
      payload: {
        environmentId: 'env_1',
        key: 'checkout-redesign',
        name: 'Checkout redesign',
        valueType: 'JSON',
        enabled: true,
        runtime: 'both',
        labels: ['checkout', 'beta'],
        jsonValue: { bucket: 'B' },
      },
    })
    expect(flagResponse.statusCode).toBe(201)
    const flag = flagResponse.json() as { id: string; key: string; runtime: string }
    expect(flag.runtime).toBe('both')

    const seededResponse = await app.inject({
      method: 'GET',
      url: '/projects/project_1/flags?environmentId=env_2',
      headers: authHeaders,
    })
    expect(seededResponse.statusCode).toBe(200)
    const seededFlags = seededResponse.json() as Array<{ key: string }>
    expect(seededFlags.map((item) => item.key)).toContain('checkout-redesign')

    const matrixResponse = await app.inject({
      method: 'GET',
      url: '/projects/project_1/flags/matrix',
      headers: authHeaders,
    })
    expect(matrixResponse.statusCode).toBe(200)
    const matrix = matrixResponse.json() as Array<{
      flagKey: string
      environments: Array<{ environmentId: string; status: string }>
    }>
    expect(matrix[0]?.environments).toHaveLength(2)

    const sdkKeyResponse = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flag-sdk-keys',
      headers: authHeaders,
      payload: { name: 'web-runtime' },
    })
    expect(sdkKeyResponse.statusCode).toBe(201)
    const sdkKey = sdkKeyResponse.json() as { key: string }

    const sdkFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : String(input))
      const payload =
        typeof init?.body === 'string' && init.body.length > 0
          ? JSON.parse(init.body)
          : undefined
      const response = await app.inject({
        method: init?.method ?? 'GET',
        url: `${url.pathname}${url.search}`,
        headers: {
          origin: 'http://localhost:5173',
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
        payload,
      })
      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers as HeadersInit,
      })
    }

    const runtimeClient = createFeatureFlagRuntimeClient({
      baseUrl: 'http://localhost:3001',
      sdkKey: sdkKey.key,
      fetch: sdkFetch,
    })

    const preOverride = await runtimeClient.evaluate({
      environmentId: 'env_1',
      flagKey: 'checkout-redesign',
      subjectKey: 'user_123',
    })
    expect(preOverride.enabled).toBe(true)
    expect(preOverride.jsonValue).toEqual({ bucket: 'B' })
    expect(preOverride.reason).toBe('json_value')

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/flags/${flag.id}`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_1',
        runtime: 'server',
      },
    })
    expect(updateResponse.statusCode).toBe(200)

    await app.close()

    const runtimeApp = await buildApp()
    const runtimeFetchAfterUpdate: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : String(input))
      const payload =
        typeof init?.body === 'string' && init.body.length > 0
          ? JSON.parse(init.body)
          : undefined
      const response = await runtimeApp.inject({
        method: init?.method ?? 'GET',
        url: `${url.pathname}${url.search}`,
        headers: {
          origin: 'http://localhost:5173',
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
        payload,
      })
      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers as HeadersInit,
      })
    }

    const runtimeClientAfterOverride = createFeatureFlagRuntimeClient({
      baseUrl: 'http://localhost:3001',
      sdkKey: sdkKey.key,
      fetch: runtimeFetchAfterUpdate,
    })

    const postUpdate = await runtimeClientAfterOverride.evaluate({
      environmentId: 'env_1',
      flagKey: 'checkout-redesign',
      subjectKey: 'user_123',
      runtime: 'client',
    })
    expect(postUpdate.enabled).toBe(false)
    expect(postUpdate.reason).toBe('runtime_not_allowed')

    const batch = await runtimeClientAfterOverride.evaluateBatch({
      environmentId: 'env_1',
      subjectKey: 'user_123',
      flagKeys: ['checkout-redesign'],
    })
    expect(batch.results).toHaveLength(1)
    expect(batch.results[0]?.enabled).toBe(true)

    state.environmentConfigs = state.environmentConfigs.filter(
      (config) => !(config.environmentId === 'env_2' && config.flagId === flag.id),
    )

    const missingConfigResult = await runtimeClientAfterOverride.evaluate({
      environmentId: 'env_2',
      flagKey: 'checkout-redesign',
      subjectKey: 'user_123',
      runtime: 'server',
    })
    expect(missingConfigResult.enabled).toBe(false)
    expect(missingConfigResult.reason).toBe('flag_not_configured')

    await runtimeApp.close()
  })

  it('rejects invalid flag payload combinations for BOOLEAN/JSON mode', async () => {
    const app = await buildApp()
    const authHeaders = { authorization: 'Bearer mgmt-token' }

    const invalidJson = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers: authHeaders,
      payload: {
        environmentId: 'env_1',
        key: 'flag-invalid-json',
        name: 'Invalid json',
        valueType: 'JSON',
        enabled: true,
        jsonValue: '{bad json}',
      },
    })
    expect(invalidJson.statusCode).toBe(400)

    const booleanWithJsonValue = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers: authHeaders,
      payload: {
        environmentId: 'env_1',
        key: 'flag-boolean-with-json',
        name: 'Boolean with json',
        valueType: 'BOOLEAN',
        enabled: true,
        booleanValue: true,
        jsonValue: { invalid: true },
      },
    })
    expect(booleanWithJsonValue.statusCode).toBe(400)

    const jsonWithBooleanValue = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers: authHeaders,
      payload: {
        environmentId: 'env_1',
        key: 'flag-json-with-boolean',
        name: 'Json with boolean',
        valueType: 'JSON',
        enabled: true,
        booleanValue: true,
        jsonValue: { valid: true },
      },
    })
    expect(jsonWithBooleanValue.statusCode).toBe(400)

    const withMultivariateField = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers: authHeaders,
      payload: {
        environmentId: 'env_1',
        key: 'flag-with-multivariate',
        name: 'With multivariate',
        valueType: 'BOOLEAN',
        enabled: true,
        multivariate: { defaultVariantKey: 'control', variants: [] },
      },
    })
    expect(withMultivariateField.statusCode).toBe(400)

    await app.close()
  })
})
