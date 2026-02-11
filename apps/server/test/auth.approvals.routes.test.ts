import { ApprovalAction, ApprovalStatus } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/auth.js';

type ApprovalRecord = {
  id: string;
  projectId: string;
  environmentId: string;
  secretId: string | null;
  action: ApprovalAction;
  status: ApprovalStatus;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  deniedAt: Date | null;
  canceledAt: Date | null;
  key: string;
  payloadCiphertext: Uint8Array | null;
  payloadIv: Uint8Array | null;
  payloadTag: Uint8Array | null;
  payloadKeyVersion: string | null;
  targetEnvironmentId: string | null;
  expectedVersionId: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
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
  projectRole: 'ADMIN',
  approvals: [] as ApprovalRecord[],
  approvalRules: [
    {
      id: 'rule_1',
      keyPattern: 'auth.config',
      actionsJson: [ApprovalAction.UPDATE],
    },
  ] as Array<{ id: string; keyPattern: string; actionsJson: ApprovalAction[] }>,
  authProjectConfig: {
    id: 'cfg_1',
    projectId: 'project_1',
    nativeAuthEnabled: true,
    emailPasswordEnabled: true,
    accessTokenTtlMinutes: 15,
    refreshTokenTtlDays: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

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
    projectMember: {
      findUnique: async () => ({ role: state.projectRole }),
      findMany: async () => [],
    },
    projectModule: { findUnique: async () => ({ enabled: true }) },
    auditLog: { create: async () => ({ id: 'audit_1' }) },
    approvalRule: {
      findMany: async () => state.approvalRules,
    },
    environment: {
      findFirst: async () => ({ id: 'env_1' }),
    },
    approvalRequest: {
      findFirst: async ({ where }: any) =>
        state.approvals.find(
          (approval) =>
            approval.projectId === where.projectId &&
            approval.environmentId === where.environmentId &&
            approval.action === where.action &&
            approval.key === where.key &&
            approval.status === where.status,
        ) ?? null,
      create: async ({ data }: any) => {
        const now = new Date();
        const created: ApprovalRecord = {
          id: `approval_${state.approvals.length + 1}`,
          projectId: data.projectId,
          environmentId: data.environmentId,
          secretId: data.secretId ?? null,
          action: data.action,
          status: data.status ?? ApprovalStatus.PENDING,
          requestedBy: data.requestedBy,
          approvedBy: null,
          approvedAt: null,
          deniedAt: null,
          canceledAt: null,
          key: data.key,
          payloadCiphertext: data.payloadCiphertext ?? null,
          payloadIv: data.payloadIv ?? null,
          payloadTag: data.payloadTag ?? null,
          payloadKeyVersion: data.payloadKeyVersion ?? null,
          targetEnvironmentId: data.targetEnvironmentId ?? null,
          expectedVersionId: data.expectedVersionId ?? null,
          metadataJson: data.metadataJson ?? null,
          createdAt: now,
          updatedAt: now,
        };
        state.approvals.push(created);
        return created;
      },
      findUnique: async ({ where }: any) =>
        state.approvals.find((approval) => approval.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const current = state.approvals.find((approval) => approval.id === where.id);
        if (!current) {
          throw new Error('Approval not found');
        }
        current.status = data.status ?? current.status;
        current.approvedBy =
          Object.prototype.hasOwnProperty.call(data, 'approvedBy')
            ? (data.approvedBy ?? null)
            : current.approvedBy;
        current.approvedAt =
          Object.prototype.hasOwnProperty.call(data, 'approvedAt')
            ? (data.approvedAt ?? null)
            : current.approvedAt;
        current.updatedAt = new Date();
        return current;
      },
    },
    authProjectConfig: {
      upsert: async ({ create, update }: any) => {
        state.authProjectConfig = {
          ...state.authProjectConfig,
          ...create,
          ...Object.fromEntries(
            Object.entries(update ?? {}).filter(([, value]) => value !== undefined),
          ),
          updatedAt: new Date(),
        };
        return state.authProjectConfig;
      },
    },
    $transaction: async (input: any) => {
      if (typeof input === 'function') {
        return input({
          approvalRequest: {
            update: async ({ where, data }: any) => {
              const current = state.approvals.find(
                (approval) => approval.id === where.id,
              );
              if (!current) {
                throw new Error('Approval not found');
              }
              current.status = data.status ?? current.status;
              current.approvedBy =
                Object.prototype.hasOwnProperty.call(data, 'approvedBy')
                  ? (data.approvedBy ?? null)
                  : current.approvedBy;
              current.approvedAt =
                Object.prototype.hasOwnProperty.call(data, 'approvedAt')
                  ? (data.approvedAt ?? null)
                  : current.approvedAt;
              current.updatedAt = new Date();
              return current;
            },
          },
          authProjectConfig: {
            upsert: async ({ create, update }: any) => {
              state.authProjectConfig = {
                ...state.authProjectConfig,
                ...create,
                ...Object.fromEntries(
                  Object.entries(update ?? {}).filter(
                    ([, value]) => value !== undefined,
                  ),
                ),
                updatedAt: new Date(),
              };
              return state.authProjectConfig;
            },
          },
        });
      }
      return Promise.all(input);
    },
  },
}));

import { buildApp } from '../src/app.js';

describe('auth approvals routes', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
  });

  beforeEach(() => {
    state.approvals = [];
    state.projectRole = 'ADMIN';
    state.approvalRules = [
      {
        id: 'rule_1',
        keyPattern: 'auth.config',
        actionsJson: [ApprovalAction.UPDATE],
      },
    ];
    state.authProjectConfig = {
      id: 'cfg_1',
      projectId: 'project_1',
      nativeAuthEnabled: true,
      emailPasswordEnabled: true,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  it('queues and applies approvals for auth config changes', async () => {
    const app = await buildApp();
    const headers = { authorization: 'Bearer mgmt-token' };

    const updateConfig = await app.inject({
      method: 'PUT',
      url: '/projects/project_1/auth/config',
      headers,
      payload: {
        nativeAuthEnabled: true,
        emailPasswordEnabled: false,
        accessTokenTtlMinutes: 20,
        refreshTokenTtlDays: 7,
      },
    });
    expect(updateConfig.statusCode).toBe(202);
    const queued = updateConfig.json() as { status: string; approvalRequestId: string };
    expect(queued.status).toBe('pending');
    expect(state.authProjectConfig.emailPasswordEnabled).toBe(true);

    const approve = await app.inject({
      method: 'POST',
      url: `/approvals/${queued.approvalRequestId}/approve`,
      headers,
    });
    expect(approve.statusCode).toBe(200);
    expect(state.authProjectConfig.emailPasswordEnabled).toBe(false);
    expect(state.authProjectConfig.accessTokenTtlMinutes).toBe(20);
    expect(state.authProjectConfig.refreshTokenTtlDays).toBe(7);

    await app.close();
  });

  it('stores provider secrets in encrypted approval payloads, not metadata', async () => {
    state.approvalRules = [
      {
        id: 'rule_2',
        keyPattern: 'auth.provider.*',
        actionsJson: [ApprovalAction.CREATE],
      },
    ];

    const app = await buildApp();
    const headers = { authorization: 'Bearer mgmt-token' };

    const providerCreate = await app.inject({
      method: 'POST',
      url: '/projects/project_1/auth/providers',
      headers,
      payload: {
        provider: 'google',
        enabled: true,
        clientId: 'google-client-id',
        clientSecret: 'super-secret-value',
      },
    });
    expect(providerCreate.statusCode).toBe(202);
    expect(state.approvals).toHaveLength(1);

    const queued = state.approvals[0]!;
    expect(queued.metadataJson?.approvalKind).toBe('provider.upsert');
    expect(queued.metadataJson).not.toHaveProperty('clientSecret');
    expect(queued.payloadCiphertext).toBeTruthy();
    expect(queued.payloadIv).toBeTruthy();
    expect(queued.payloadTag).toBeTruthy();
    expect(queued.payloadKeyVersion).toBeTruthy();

    await app.close();
  });
});
