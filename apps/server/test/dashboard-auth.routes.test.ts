import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  dashboardSession: null as {
    session: { id: string; token: string };
    user: { id: string; email: string; name: string };
  } | null,
};

const { signInEmail, signUpEmail, signOut } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../src/betterAuth.js', () => ({
  auth: {
    handler: async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    api: {
      getSession: async () => state.dashboardSession,
      signInEmail,
      signUpEmail,
      signOut,
    },
  },
  getDashboardSession: async () => state.dashboardSession,
  applyAuthSetCookies: (
    reply: { header: (name: string, value: string) => unknown },
    headers: Headers,
  ) => {
    for (const cookie of headers.getSetCookie?.() ?? []) {
      reply.header('set-cookie', cookie);
    }
  },
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  const chain = () => {
    const c: any = {};
    c.values = vi.fn(() => c);
    c.set = vi.fn(() => c);
    c.where = vi.fn(() => c);
    c.returning = vi.fn(async () => [{}]);
    c.from = vi.fn(() => c);
    c.innerJoin = vi.fn(() => c);
    c.limit = vi.fn(() => c);
    c.orderBy = vi.fn(() => c);
    c.onConflictDoUpdate = vi.fn(() => c);
    c.onConflictDoNothing = vi.fn(() => c);
    c.then = (resolve: any, reject: any) => Promise.resolve([{ value: 0 }]).then(resolve, reject);
    return c;
  };
  const db: any = {
    query: new Proxy({}, {
      get: () => ({
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      }),
    }),
    insert: vi.fn(() => chain()),
    update: vi.fn(() => chain()),
    delete: vi.fn(() => chain()),
    select: vi.fn(() => chain()),
    transaction: vi.fn(async (cb: any) => cb(db)),
    run: vi.fn(async () => ({ rowsAffected: 0 })),
  };
  return { ...actual, db };
});

import { buildApp } from '../src/app.js';

describe('dashboard auth via better-auth', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
    process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret';
  });

  beforeEach(() => {
    state.dashboardSession = null;
    signInEmail.mockReset();
    signUpEmail.mockReset();
    signOut.mockReset();
  });

  it('registers through better-auth signUpEmail', async () => {
    signUpEmail.mockResolvedValueOnce({
      headers: new Headers(),
      response: { user: { id: 'user_1', email: 'user@example.com', name: 'User' }, token: null },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: 'user@example.com', password: 'password123', name: 'User' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      message: 'Registration successful.',
      email: 'user@example.com',
    });
    expect(signUpEmail).toHaveBeenCalled();
    await app.close();
  });

  it('logs in through better-auth and returns user', async () => {
    const setCookieHeaders = new Headers();
    setCookieHeaders.append('set-cookie', 'sm.session_token=abc; Path=/; HttpOnly');
    signInEmail.mockResolvedValueOnce({
      headers: setCookieHeaders,
      response: {
        user: { id: 'user_1', email: 'user@example.com', name: 'User' },
        token: 'abc',
      },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: 'user@example.com', password: 'password123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
    });
    expect(response.cookies.some((cookie) => cookie.name === 'sm_csrf')).toBe(true);
    await app.close();
  });

  it('resolves /me from better-auth session', async () => {
    state.dashboardSession = {
      session: { id: 'session_1', token: 'session-token' },
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
    };

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      cookies: { 'sm.session_token': 'session-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: 'user_1', email: 'user@example.com', name: 'User' },
    });
    await app.close();
  });

  it('mounts better-auth handler at /api/auth/*', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/ok',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it('logs out through better-auth signOut', async () => {
    signOut.mockResolvedValueOnce({
      headers: new Headers(),
      response: { success: true },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        'x-csrf-token': 'csrf',
      },
      cookies: { 'sm.session_token': 'session-token', sm_csrf: 'csrf' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(signOut).toHaveBeenCalled();
    await app.close();
  });
});
