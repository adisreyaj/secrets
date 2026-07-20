import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userSession: null as any,
  apiToken: null as any,
  serviceToken: null as any,
  globalToken: null as any,
  projectMembership: null as any,
  projectMemberships: [] as any[],
  cliSession: null as any,
}));

const { createReturning, updateSpy, insertValues } = vi.hoisted(() => ({
  createReturning: vi.fn(),
  updateSpy: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock('../src/betterAuth.js', () => ({
  auth: {
    handler: async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    api: {
      getSession: async () => state.userSession,
      signInEmail: async () => ({ headers: new Headers(), response: { user: {} } }),
      signUpEmail: async () => ({ headers: new Headers(), response: { user: {} } }),
      signOut: async () => ({ headers: new Headers(), response: { success: true } }),
    },
  },
  getDashboardSession: async () => state.userSession,
  applyAuthSetCookies: () => undefined,
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();

  const db: any = {
    query: {
      apiTokens: { findFirst: async () => state.apiToken },
      serviceAccountTokens: { findFirst: async () => state.serviceToken },
      globalCliTokens: {
        findFirst: async () => {
          if (!state.globalToken) return null;
          const expiresAt = state.globalToken.expiresAt as Date;
          if (!(expiresAt > new Date())) return null;
          if (state.globalToken.revokedAt) return null;
          if (state.globalToken.deletedAt) return null;
          return state.globalToken;
        },
      },
      projectMembers: {
        findFirst: async () => state.projectMembership,
        findMany: async () => state.projectMemberships,
      },
      cliLoginSessions: {
        findFirst: async () => state.cliSession,
      },
      projects: { findFirst: async () => null },
    },
    insert: () => ({
      values: (data: any) => {
        insertValues(data);
        if (data.code) {
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
        }
        return {
          returning: async () => {
            const created = await createReturning();
            return [created ?? { id: 'created_1', ...data, createdAt: new Date() }];
          },
        };
      },
    }),
    update: () => {
      const chain: any = {
        set: (data: any) => {
          updateSpy(data);
          if (state.cliSession) state.cliSession = { ...state.cliSession, ...data };
          if (state.globalToken && data.lastUsedAt) {
            state.globalToken.lastUsedAt = data.lastUsedAt;
          }
          return chain;
        },
        where: () => chain,
        returning: async () => [state.globalToken ?? {}],
      };
      return chain;
    },
    select: () => {
      const rows = Promise.resolve([{ value: 0 }]);
      const chain: any = {
        from: () => chain,
        where: () => rows,
      };
      return chain;
    },
    transaction: async (cb: any) => cb(db),
  };

  return { ...actual, db };
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
    process.env.ENABLE_GLOBAL_CLI_TOKENS = 'true';
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
    createReturning.mockReset();
    updateSpy.mockReset();
    insertValues.mockReset();
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
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
    };

    createReturning.mockResolvedValueOnce({
      id: 'gct_created',
      name: 'CLI login',
      projectId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUsedAt: null,
      expiresAt: new Date('2026-01-31T00:00:00.000Z'),
      readOnly: false,
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
    await app.close();
  });

  it('requires projectId in project mode', async () => {
    state.userSession = {
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
