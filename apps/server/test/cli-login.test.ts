import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionsByCode = new Map<string, any>();
const sessionsById = new Map<string, any>();
let idCounter = 0;

vi.mock('../src/db.js', () => {
  const prisma = {
    cliLoginSession: {
      create: async ({ data }: { data: any }) => {
        const id = `session_${idCounter += 1}`;
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
        return session;
      },
      findUnique: async ({ where }: { where: { code?: string; id?: string } }) => {
        if (where.code) return sessionsByCode.get(where.code) ?? null;
        if (where.id) return sessionsById.get(where.id) ?? null;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const session = sessionsById.get(where.id);
        if (!session) return null;
        const updated = { ...session, ...data };
        sessionsById.set(where.id, updated);
        sessionsByCode.set(updated.code, updated);
        return updated;
      },
    },
    userSession: { findFirst: async () => null },
    apiToken: { findFirst: async () => null },
    projectMember: { findUnique: async () => null },
  };
  return { prisma };
});

import { buildApp } from '../src/app.js';

describe('CLI login endpoints', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
  });

  beforeEach(() => {
    sessionsByCode.clear();
    sessionsById.clear();
    idCounter = 0;
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

    const session = sessionsByCode.get(payload.code);
    session.token = 'cli-token-value';
    session.projectId = 'project_123';
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
      token: 'cli-token-value',
      projectId: 'project_123',
    });
    await app.close();
  });

  it('returns 404 for expired code', async () => {
    const app = await buildApp();
    const code = 'expired-code';
    const expired = {
      id: 'session_expired',
      code,
      token: null,
      userId: null,
      projectId: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: null,
    };
    sessionsByCode.set(code, expired);
    sessionsById.set(expired.id, expired);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/cli-login/complete',
      payload: { code },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
