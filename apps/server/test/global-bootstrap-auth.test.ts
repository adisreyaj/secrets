import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  userSession: null as any,
  apiToken: null as any,
  serviceToken: null as any,
  globalToken: null as any,
  projectMembership: null as any,
  projectMemberships: [] as any[],
  cliSession: null as any,
};

const { createSpy, updateSpy, auditCreateSpy } = vi.hoisted(() => ({
  createSpy: vi.fn(),
  updateSpy: vi.fn(),
  auditCreateSpy: vi.fn(),
}));

vi.mock('../src/db.js', () => {
  const prisma = {
    userSession: {
      findFirst: async () => state.userSession,
      create: async () => ({ id: 'user_session_1' }),
      deleteMany: async () => ({ count: 0 }),
    },
    apiToken: {
      findFirst: async () => state.apiToken,
      create: createSpy,
      update: updateSpy,
    },
    globalCliToken: {
      findFirst: async ({ where }: { where: any }) => {
        if (!state.globalToken) return null;
        const expiresAt = state.globalToken.expiresAt as Date;
        if (where?.expiresAt?.gt && !(expiresAt > where.expiresAt.gt)) return null;
        if (where?.revokedAt === null && state.globalToken.revokedAt) return null;
        if (where?.deletedAt === null && state.globalToken.deletedAt) return null;
        return state.globalToken;
      },
      create: createSpy,
      update: updateSpy,
    },
    serviceAccountToken: {
      findFirst: async () => state.serviceToken,
      update: updateSpy,
    },
    projectMember: {
      findUnique: async () => state.projectMembership,
      findMany: async () => state.projectMemberships,
    },
    cliLoginSession: {
      findUnique: async ({ where }: { where: { code: string } }) => {
        if (!state.cliSession) return null;
        return state.cliSession.code === where.code ? state.cliSession : null;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.cliSession = { ...state.cliSession, ...data };
        return state.cliSession;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.cliSession = {
          id: 'cli_session_1',
          code: String(data.code),
          token: null,
          userId: null,
          projectId: null,
          createdAt: new Date(),
          expiresAt: data.expiresAt,
          consumedAt: null,
        };
        return state.cliSession;
      },
    },
    project: {
      create: async () => ({ id: 'project_created', name: 'P', slug: 'p', createdAt: new Date(), updatedAt: new Date() }),
      findUnique: async () => null,
    },
    user: {
      findUnique: async () => null,
      create: async () => ({ id: 'user_1', email: 'u@example.com', name: 'User' }),
      update: async () => ({ id: 'user_1', email: 'u@example.com', name: 'User' }),
    },
    auditLog: {
      create: auditCreateSpy,
    },
  };
  return { prisma };
});

import { buildApp } from '../src/app.js';

const bearer = { authorization: 'Bearer global-raw-token' };

function setupGlobalToken(overrides: Record<string, unknown> = {}) {
  state.globalToken = {
    id: 'gct_1',
    name: 'CLI login',
    tokenHash: 'hash',
    createdBy: 'user_1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    lastUsedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    deletedAt: null,
    creator: { id: 'user_1', email: 'user@example.com', name: 'User' },
    ...overrides,
  };
}

describe('global bootstrap token auth scope', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
  });

  beforeEach(() => {
    state.userSession = null;
    state.apiToken = null;
    state.serviceToken = null;
    state.globalToken = null;
    state.projectMembership = null;
    state.projectMemberships = [];
    state.cliSession = {
      id: 'cli_session_1',
      code: 'code_1',
      token: null,
      userId: null,
      projectId: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };
    createSpy.mockReset();
    updateSpy.mockReset();
    auditCreateSpy.mockReset();
  });

  it('allows GET /projects for global token and updates lastUsedAt', async () => {
    setupGlobalToken();
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/projects', headers: bearer });

    expect(response.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
    await app.close();
  });

  it('denies secret reads for global token', async () => {
    setupGlobalToken();
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/environments/env_1/secrets',
      headers: bearer,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'Global bootstrap token is restricted to project bootstrap endpoints',
    });
    await app.close();
  });

  it('rejects expired global tokens', async () => {
    setupGlobalToken({ expiresAt: new Date(Date.now() - 60_000) });
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/projects', headers: bearer });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('issues global token when mode omitted', async () => {
    state.userSession = {
      id: 'session_1',
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
    };

    createSpy.mockResolvedValueOnce({
      id: 'gct_created',
      name: 'CLI login',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUsedAt: null,
      expiresAt: new Date('2026-01-31T00:00:00.000Z'),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/issue',
      cookies: { sm_session: 'session-token' },
      headers: { origin: 'http://localhost:5173' },
      payload: { code: 'code_1' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as any;
    expect(body.tokenMeta.scopeType).toBe('global_bootstrap');
    expect(body.tokenMeta.projectId).toBeUndefined();
    expect(auditCreateSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires projectId in project mode', async () => {
    state.userSession = {
      id: 'session_1',
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
    };

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/issue',
      cookies: { sm_session: 'session-token' },
      headers: { origin: 'http://localhost:5173' },
      payload: { code: 'code_1', mode: 'project' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'projectId is required in project mode' });
    await app.close();
  });

  it('rejects revoked global tokens', async () => {
    setupGlobalToken({ revokedAt: new Date() });
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/projects', headers: bearer });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
