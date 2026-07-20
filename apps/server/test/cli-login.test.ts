import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionsByCode, sessionsById, nextId } = vi.hoisted(() => {
  const sessionsByCode = new Map<string, any>();
  const sessionsById = new Map<string, any>();
  let idSeq = 0;
  return {
    sessionsByCode,
    sessionsById,
    nextId: () => `session_${(idSeq += 1)}`,
  };
});

vi.mock('../src/betterAuth.js', () => ({
  auth: {
    handler: async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    api: {
      getSession: async () => null,
      signInEmail: async () => ({ headers: new Headers(), response: { user: {} } }),
      signUpEmail: async () => ({ headers: new Headers(), response: { user: {} } }),
      signOut: async () => ({ headers: new Headers(), response: { success: true } }),
    },
  },
  getDashboardSession: async () => null,
  applyAuthSetCookies: () => undefined,
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();

  const db: any = {
    query: {
      cliLoginSessions: {
        findFirst: async () => {
          // Single-session tests: return the only stored session.
          const all = [...sessionsByCode.values()];
          return all[0] ?? null;
        },
      },
      apiTokens: { findFirst: async () => null },
      serviceAccountTokens: { findFirst: async () => null },
      globalCliTokens: { findFirst: async () => null },
      projectMembers: { findFirst: async () => null },
    },
    insert: () => ({
      values: async (data: any) => {
        const id = nextId();
        const session = {
          id,
          code: data.code,
          token: data.token ?? null,
          userId: data.userId ?? null,
          projectId: data.projectId ?? null,
          createdAt: data.createdAt ?? new Date(),
          expiresAt: data.expiresAt,
          consumedAt: data.consumedAt ?? null,
        };
        sessionsByCode.set(session.code, session);
        sessionsById.set(session.id, session);
        return undefined;
      },
    }),
    update: () => {
      let patch: Record<string, unknown> = {};
      const chain: any = {
        set: (data: Record<string, unknown>) => {
          patch = data;
          return chain;
        },
        where: async () => {
          for (const [id, session] of sessionsById) {
            const updated = { ...session, ...patch };
            sessionsById.set(id, updated);
            sessionsByCode.set(updated.code, updated);
          }
        },
      };
      return chain;
    },
  };

  return { ...actual, db };
});

import { buildApp } from '../src/app.js';

describe('CLI login endpoints', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
  });

  beforeEach(() => {
    sessionsByCode.clear();
    sessionsById.clear();
  });

  it('starts CLI login and returns login URL + code', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/cli-login',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { code: string; loginUrl: string; expiresAt: string };
    expect(payload.code).toBeTruthy();
    expect(payload.loginUrl).toContain('/cli-login?code=');
    expect(payload.loginUrl).toContain(payload.code);
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    await app.close();
  });

  it('returns pending until token issued, then completes', async () => {
    const app = await buildApp();
    const start = await app.inject({ method: 'POST', url: '/auth/cli-login' });
    const payload = start.json() as { code: string };

    const pending = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/complete',
      payload: { code: payload.code },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual({ status: 'pending' });

    const session = sessionsByCode.get(payload.code)!;
    session.token = 'cli-token';
    sessionsByCode.set(payload.code, session);
    sessionsById.set(session.id, session);

    const complete = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/complete',
      payload: { code: payload.code },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toEqual({
      status: 'complete',
      token: 'cli-token',
    });
    await app.close();
  });

  it('omits projectId for global bootstrap completion payload', async () => {
    const app = await buildApp();
    const start = await app.inject({ method: 'POST', url: '/auth/cli-login' });
    const payload = start.json() as { code: string };

    const session = sessionsByCode.get(payload.code)!;
    session.token = 'global-cli-token';
    session.projectId = null;
    sessionsByCode.set(payload.code, session);
    sessionsById.set(session.id, session);

    const complete = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/complete',
      payload: { code: payload.code },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toEqual({
      status: 'complete',
      token: 'global-cli-token',
    });
    await app.close();
  });

  it('returns 404 for expired code', async () => {
    const app = await buildApp();
    const start = await app.inject({ method: 'POST', url: '/auth/cli-login' });
    const payload = start.json() as { code: string };
    const session = sessionsByCode.get(payload.code)!;
    session.expiresAt = new Date(Date.now() - 1000);
    sessionsByCode.set(payload.code, session);

    const complete = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/complete',
      payload: { code: payload.code },
    });
    expect(complete.statusCode).toBe(404);
    await app.close();
  });
});
