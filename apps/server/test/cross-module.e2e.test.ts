import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/auth.js';

type Flag = {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  valueType: 'BOOLEAN' | 'JSON';
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type EnvironmentConfig = {
  id: string;
  flagId: string;
  environmentId: string;
  enabled: boolean;
  valueType: 'BOOLEAN' | 'JSON';
  booleanValue: boolean | null;
  jsonValue: unknown | null;
  runtime: 'BOTH' | 'CLIENT' | 'SERVER';
  labelsJson: string[];
  createdAt: Date;
  updatedAt: Date;
};

type SdkKey = {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  tokenHash: string;
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

const state = {
  apiToken: {
    id: 'token_1',
    tokenHash: hashToken('mgmt-token'),
    projectId: 'project_1',
    createdBy: 'user_1',
    readOnly: false,
    creator: { id: 'user_1', email: 'owner@example.com', name: 'Owner' },
  },
  authConfig: {
    id: 'cfg_1',
    projectId: 'project_1',
    nativeAuthEnabled: true,
    emailPasswordEnabled: true,
    accessTokenTtlMinutes: 15,
    refreshTokenTtlDays: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  environments: [
    { id: 'env_1', projectId: 'project_1', name: 'Production', createdAt: new Date('2026-01-01') },
    { id: 'env_2', projectId: 'project_1', name: 'Staging', createdAt: new Date('2026-01-02') },
  ],
  flags: [] as Flag[],
  environmentConfigs: [] as EnvironmentConfig[],
  sdkKeys: [] as SdkKey[],
};

function nextId(prefix: string, size: number): string {
  return `${prefix}_${size + 1}`;
}

vi.mock('../src/db.js', () => ({
  prisma: {
    userSession: { findFirst: async () => null },
    apiToken: {
      findFirst: async ({ where }: any) =>
        where?.tokenHash === state.apiToken.tokenHash ? state.apiToken : null,
      update: async () => ({ id: state.apiToken.id }),
    },
    serviceAccountToken: { findFirst: async () => null },
    globalCliToken: { findFirst: async () => null },
    projectMember: { findUnique: async () => ({ role: 'ADMIN' }) },
    projectModule: { findUnique: async () => ({ enabled: true }) },
    auditLog: { create: async () => ({ id: 'audit_1' }) },
    featureFlagChangeHistory: { create: async () => ({ id: 'ffh_1' }) },
    approvalRule: { findMany: async () => [] },
    approvalRequest: {
      findFirst: async () => null,
      create: async () => ({ id: 'approval_1' }),
    },
    authProjectConfig: {
      upsert: async ({ create, update }: any) => {
        state.authConfig = {
          ...state.authConfig,
          ...create,
          ...Object.fromEntries(
            Object.entries(update ?? {}).filter(([, value]) => value !== undefined),
          ),
          updatedAt: new Date(),
        };
        return state.authConfig;
      },
    },
    environment: {
      findUnique: async ({ where }: any) =>
        state.environments.find((environment) => environment.id === where?.id) ?? null,
      findMany: async ({ where }: any) =>
        state.environments.filter((environment) => environment.projectId === where.projectId),
    },
    secret: {
      findMany: async () => [],
    },
    featureFlag: {
      findMany: async ({ where, include, select }: any) => {
        const filtered = state.flags.filter(
          (flag) =>
            flag.projectId === where.projectId &&
            flag.deletedAt === null &&
            (!where.key?.in || where.key.in.includes(flag.key)) &&
            (!where.NOT?.id || flag.id !== where.NOT.id),
        );
        if (select?.key) {
          return filtered.map((flag) => ({ key: flag.key }));
        }
        if (!include) return filtered;
        return filtered.map((flag) => ({
          ...flag,
          environmentConfigs: state.environmentConfigs
            .filter(
              (config) =>
                config.flagId === flag.id &&
                (!include.environmentConfigs?.where?.environmentId ||
                  config.environmentId === include.environmentConfigs.where.environmentId),
            ),
        }));
      },
      findFirst: async ({ where, include }: any) => {
        const found =
          state.flags.find(
            (flag) =>
              (!where?.id || flag.id === where.id) &&
              (!where?.projectId || flag.projectId === where.projectId) &&
              flag.deletedAt === null,
          ) ?? null;
        if (!found) return null;
        if (!include) return found;
        return {
          ...found,
          environmentConfigs: state.environmentConfigs
            .filter(
              (config) =>
                config.flagId === found.id &&
                (!include.environmentConfigs?.where?.environmentId ||
                  config.environmentId === include.environmentConfigs.where.environmentId),
            ),
        };
      },
      create: async ({ data }: any) => {
        const now = new Date();
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
        };
        state.flags.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const current = state.flags.find((flag) => flag.id === where.id);
        if (!current) throw new Error('Flag not found');
        if (typeof data.key !== 'undefined') current.key = data.key;
        if (typeof data.name !== 'undefined') current.name = data.name;
        if (Object.prototype.hasOwnProperty.call(data, 'description')) {
          current.description = data.description ?? null;
        }
        if (typeof data.valueType !== 'undefined') current.valueType = data.valueType;
        if (typeof data.enabled !== 'undefined') current.enabled = data.enabled;
        current.updatedAt = new Date();
        return current;
      },
    },
    featureFlagEnvironmentConfig: {
      upsert: async ({ where, create, update }: any) => {
        const existing = state.environmentConfigs.find(
          (item) =>
            item.flagId === where.flagId_environmentId.flagId &&
            item.environmentId === where.flagId_environmentId.environmentId,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const now = new Date();
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
        };
        state.environmentConfigs.push(created);
        return created;
      },
      findUnique: async ({ where, include }: any) => {
        let config: EnvironmentConfig | null = null;
        if (where?.id) {
          config =
            state.environmentConfigs.find((item) => item.id === where.id) ?? null;
        } else if (where?.flagId_environmentId) {
          config =
            state.environmentConfigs.find(
              (item) =>
                item.flagId === where.flagId_environmentId.flagId &&
                item.environmentId === where.flagId_environmentId.environmentId,
            ) ?? null;
        }
        if (!config) return null;
        return config;
      },
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
        };
        state.sdkKeys.push(created);
        return created;
      },
      findMany: async ({ where }: any) =>
        state.sdkKeys.filter(
          (key) => key.projectId === where.projectId && key.revokedAt === where.revokedAt,
        ),
      findFirst: async ({ where }: any) =>
        state.sdkKeys.find(
          (key) =>
            key.tokenHash === where.tokenHash &&
            key.revokedAt === null &&
            (!key.expiresAt || key.expiresAt > new Date()),
        ) ?? null,
      update: async ({ where, data }: any) => {
        const key = state.sdkKeys.find((candidate) => candidate.id === where.id);
        if (!key) throw new Error('SDK key not found');
        Object.assign(key, data);
        return key;
      },
    },
    $transaction: async (input: any) =>
      typeof input === 'function' ? input({}) : Promise.all(input),
  },
}));

import { buildApp } from '../src/app.js';

describe('cross-module e2e', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
  });

  beforeEach(() => {
    state.flags = [];
    state.environmentConfigs = [];
    state.sdkKeys = [];
  });

  it('covers auth + secrets + flags paths in one project context', async () => {
    const app = await buildApp();
    const headers = { authorization: 'Bearer mgmt-token', origin: 'http://localhost:5173' };

    const authConfig = await app.inject({
      method: 'GET',
      url: '/projects/project_1/auth/config',
      headers,
    });
    expect(authConfig.statusCode).toBe(200);
    expect((authConfig.json() as { nativeAuthEnabled: boolean }).nativeAuthEnabled).toBe(true);

    const secrets = await app.inject({
      method: 'GET',
      url: '/environments/env_1/secrets?includeValues=false',
      headers,
    });
    expect(secrets.statusCode).toBe(200);
    expect(secrets.json()).toEqual([]);

    const createdFlag = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flags',
      headers,
      payload: {
        environmentId: 'env_1',
        key: 'checkout-redesign',
        name: 'Checkout Redesign',
        valueType: 'BOOLEAN',
        enabled: true,
        booleanValue: true,
        runtime: 'both',
        labels: ['checkout'],
      },
    });
    expect(createdFlag.statusCode).toBe(201);
    const flag = createdFlag.json() as { id: string; key: string };

    const sdkCreate = await app.inject({
      method: 'POST',
      url: '/projects/project_1/flag-sdk-keys',
      headers,
      payload: { name: 'Cross Module SDK Key' },
    });
    expect(sdkCreate.statusCode).toBe(201);
    const sdkBody = sdkCreate.json() as { key: string };
    expect(sdkBody.key).toContain('ffsk_');

    const evaluate = await app.inject({
      method: 'POST',
      url: '/runtime/flags/evaluate',
      headers: {
        authorization: `Bearer ${sdkBody.key}`,
        origin: 'http://localhost:5173',
      },
      payload: {
        environmentId: 'env_1',
        flagKey: flag.key,
        subjectKey: 'user_123',
      },
    });
    expect(evaluate.statusCode).toBe(200);
    const evalBody = evaluate.json() as {
      enabled: boolean;
      flagKey: string;
      reason: string;
    };
    expect(evalBody.flagKey).toBe('checkout-redesign');
    expect(evalBody.enabled).toBe(true);
    expect(evalBody.reason).toBe('boolean_value');

    await app.close();
  });
});
