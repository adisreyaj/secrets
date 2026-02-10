import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '../src/auth.js'

type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

type Flag = {
  id: string
  projectId: string
  key: string
  name: string
  description: string | null
  valueType: 'BOOLEAN' | 'MULTIVARIATE'
  enabled: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

type Variant = {
  id: string
  flagId: string
  key: string
  value: string
  weight: number
  createdAt: Date
  updatedAt: Date
}

type Rule = {
  id: string
  flagId: string
  priority: number
  rolloutPercentage: number
  variantId: string | null
  environmentId: string | null
  createdAt: Date
  updatedAt: Date
}

type Override = {
  id: string
  flagId: string
  environmentId: string
  enabled: boolean | null
  variantId: string | null
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
  environments: [{ id: 'env_1', projectId: 'project_1' }],
  flags: [] as Flag[],
  variants: [] as Variant[],
  rules: [] as Rule[],
  overrides: [] as Override[],
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
          variants: state.variants.filter((variant) => variant.flagId === flag.id),
          rules: state.rules.filter((rule) => rule.flagId === flag.id),
          envOverrides: state.overrides.filter(
            (override) =>
              override.flagId === flag.id &&
              (!include.envOverrides?.where?.environmentId ||
                override.environmentId === include.envOverrides.where.environmentId),
          ),
        }))
      },
      findFirst: async ({ where }: any) => {
        const found = state.flags.find((flag) => {
          if (where?.id && flag.id !== where.id) return false
          if (where?.deletedAt === null && flag.deletedAt !== null) return false
          return true
        })
        return found ?? null
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
    },
    featureFlagVariant: {
      create: async ({ data }: any) => {
        const now = new Date()
        const created: Variant = {
          id: nextId('variant', state.variants.length),
          flagId: data.flagId,
          key: data.key,
          value: data.value,
          weight: data.weight,
          createdAt: now,
          updatedAt: now,
        }
        state.variants.push(created)
        return created
      },
      findFirst: async ({ where }: any) =>
        state.variants.find(
          (variant) =>
            (!where?.id || variant.id === where.id) &&
            (!where?.flagId || variant.flagId === where.flagId),
        ) ?? null,
      findMany: async ({ where }: any) =>
        state.variants.filter((variant) => variant.flagId === where.flagId),
    },
    featureFlagRule: {
      create: async ({ data }: any) => {
        const now = new Date()
        const created: Rule = {
          id: nextId('rule', state.rules.length),
          flagId: data.flagId,
          priority: data.priority,
          rolloutPercentage: data.rolloutPercentage,
          variantId: data.variantId ?? null,
          environmentId: null,
          createdAt: now,
          updatedAt: now,
        }
        state.rules.push(created)
        return created
      },
      findMany: async ({ where }: any) => state.rules.filter((rule) => rule.flagId === where.flagId),
    },
    featureFlagEnvironmentOverride: {
      findUnique: async ({ where }: any) =>
        state.overrides.find(
          (override) =>
            override.flagId === where.flagId_environmentId.flagId &&
            override.environmentId === where.flagId_environmentId.environmentId,
        ) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = state.overrides.find(
          (override) =>
            override.flagId === where.flagId_environmentId.flagId &&
            override.environmentId === where.flagId_environmentId.environmentId,
        )
        if (existing) {
          existing.enabled = update.enabled
          existing.variantId = update.variantId
          existing.updatedAt = new Date()
          return existing
        }
        const created: Override = {
          id: nextId('override', state.overrides.length),
          flagId: create.flagId,
          environmentId: create.environmentId,
          enabled: create.enabled ?? null,
          variantId: create.variantId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        state.overrides.push(created)
        return created
      },
      deleteMany: async ({ where }: any) => {
        const before = state.overrides.length
        state.overrides = state.overrides.filter(
          (override) =>
            !(
              override.flagId === where.flagId &&
              override.environmentId === where.environmentId
            ),
        )
        return { count: before - state.overrides.length }
      },
    },
    environment: {
      findUnique: async ({ where }: any) =>
        state.environments.find((environment) => environment.id === where.id) ?? null,
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
    state.variants = []
    state.rules = []
    state.overrides = []
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

  it('covers create -> rollout -> override -> runtime SDK evaluation', async () => {
    const app = await buildApp()
    const authHeaders = { authorization: 'Bearer mgmt-token' }

    const flagResponse = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers: authHeaders,
      payload: {
        key: 'checkout-redesign',
        name: 'Checkout redesign',
        valueType: 'MULTIVARIATE',
        enabled: true,
      },
    })
    expect(flagResponse.statusCode).toBe(201)
    const flag = flagResponse.json() as { id: string; key: string }

    const controlVariantResponse = await app.inject({
      method: 'POST',
      url: `/flags/${flag.id}/variants`,
      headers: authHeaders,
      payload: { key: 'control', value: 'A', weight: 20 },
    })
    expect(controlVariantResponse.statusCode).toBe(201)

    const treatmentVariantResponse = await app.inject({
      method: 'POST',
      url: `/flags/${flag.id}/variants`,
      headers: authHeaders,
      payload: { key: 'treatment', value: 'B', weight: 80 },
    })
    expect(treatmentVariantResponse.statusCode).toBe(201)
    const treatment = treatmentVariantResponse.json() as { id: string; key: string }

    const ruleResponse = await app.inject({
      method: 'POST',
      url: `/flags/${flag.id}/rules`,
      headers: authHeaders,
      payload: { priority: 0, rolloutPercentage: 100, variantId: treatment.id },
    })
    expect(ruleResponse.statusCode).toBe(201)

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
    expect(preOverride.variantKey).toBe('treatment')
    expect(preOverride.reason).toBe('rule_enabled')

    const overrideResponse = await app.inject({
      method: 'PUT',
      url: `/flags/${flag.id}/environments/env_1/override`,
      headers: authHeaders,
      payload: { enabled: false },
    })
    expect(overrideResponse.statusCode).toBe(200)

    await app.close()

    const runtimeApp = await buildApp()
    const runtimeFetchAfterOverride: typeof fetch = async (input, init) => {
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
      fetch: runtimeFetchAfterOverride,
    })

    const postOverride = await runtimeClientAfterOverride.evaluate({
      environmentId: 'env_1',
      flagKey: 'checkout-redesign',
      subjectKey: 'user_123',
    })
    expect(postOverride.enabled).toBe(false)
    expect(postOverride.reason).toBe('override_disabled')

    const batch = await runtimeClientAfterOverride.evaluateBatch({
      environmentId: 'env_1',
      subjectKey: 'user_123',
      flagKeys: ['checkout-redesign'],
    })
    expect(batch.results).toHaveLength(1)
    expect(batch.results[0]?.enabled).toBe(false)

    await runtimeApp.close()
  })
})
