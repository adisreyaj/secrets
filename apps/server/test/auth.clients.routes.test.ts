import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/auth.js';

type AuthClientRecord = {
  id: string;
  projectId: string;
  name: string;
  type: 'PUBLIC' | 'CONFIDENTIAL';
  clientId: string;
  clientSecretHash: string | null;
  redirectUrisJson: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const state = vi.hoisted(() => ({
  apiToken: {
    id: 'token_1',
    tokenHash: '',
    projectId: 'project_1',
    createdBy: 'user_1',
    readOnly: false,
    creator: { id: 'user_1', email: 'owner@example.com', name: 'Owner' },
  },
  projectRole: 'ADMIN' as const,
  clients: [] as AuthClientRecord[],
}));

vi.mock('../src/betterAuth.js', () => ({
  auth: {
    handler: async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    api: { getSession: async () => null },
  },
  getDashboardSession: async () => null,
  applyAuthSetCookies: () => undefined,
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();

  let clientSeq = 0;

  const db: any = {
    query: {
      apiTokens: {
        findFirst: async () =>
          state.apiToken.tokenHash ? state.apiToken : null,
      },
      serviceAccountTokens: { findFirst: async () => null },
      globalCliTokens: { findFirst: async () => null },
      projectMembers: {
        findFirst: async () => ({ role: state.projectRole }),
      },
      projectModules: {
        findFirst: async () => ({ enabled: true }),
      },
      authClients: {
        findMany: async () => state.clients.filter((c) => c.deletedAt === null),
        findFirst: async () =>
          state.clients.find((c) => c.deletedAt === null) ?? null,
      },
    },
    insert: () => ({
      values: (data: any) => {
        if (data.clientId) {
          const now = new Date();
          clientSeq += 1;
          const created: AuthClientRecord = {
            id: `client_${clientSeq}`,
            projectId: data.projectId,
            name: data.name,
            type: data.type,
            clientId: data.clientId,
            clientSecretHash: data.clientSecretHash ?? null,
            redirectUrisJson: data.redirectUrisJson ?? [],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          state.clients.push(created);
          return { returning: async () => [created] };
        }
        return { returning: async () => [{ id: 'audit_1' }] };
      },
    }),
    update: () => {
      let patch: any = {};
      const chain: any = {
        set: (data: any) => {
          patch = data;
          return chain;
        },
        where: () => {
          if (patch.lastUsedAt) return chain;
          const current = state.clients.find((c) => !c.deletedAt) ?? state.clients.at(-1);
          if (current) {
            Object.assign(current, patch);
            current.updatedAt = new Date();
          }
          return chain;
        },
        returning: async () => {
          const current = state.clients.find((c) => !c.deletedAt) ?? state.clients.at(-1);
          return current ? [current] : [];
        },
      };
      return chain;
    },
  };

  db.query.authClients.findFirst = async () =>
    state.clients.find((c) => c.deletedAt === null) ?? null;
  db.query.authClients.findMany = async () =>
    state.clients.filter((c) => c.deletedAt === null);

  return { ...actual, db };
});

import { buildApp } from '../src/app.js';
import { authenticateAuthClient } from '../src/server/services/auth/clientCredentials.js';

describe('auth clients management routes', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
    state.apiToken.tokenHash = hashToken('mgmt-token');
  });

  beforeEach(() => {
    state.clients = [];
    state.projectRole = 'ADMIN';
  });

  it('creates, rotates, lists and deletes auth clients', async () => {
    const app = await buildApp();
    const headers = { authorization: 'Bearer mgmt-token' };

    const create = await app.inject({
      method: 'POST',
      url: '/projects/project_1/auth/clients',
      headers,
      payload: {
        name: 'Server App',
        type: 'confidential',
        redirectUris: ['https://app.example.com/callback'],
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as any;
    expect(created.client.clientId).toMatch(/^ac_/);
    expect(created.clientSecret).toMatch(/^acs_/);

    const authOk = await authenticateAuthClient({
      projectId: 'project_1',
      clientId: created.client.clientId,
      clientSecret: created.clientSecret,
    });
    expect(authOk).not.toBeNull();

    const rotate = await app.inject({
      method: 'PATCH',
      url: `/auth/clients/${created.client.id}`,
      headers,
      payload: { rotateSecret: true },
    });
    expect(rotate.statusCode).toBe(200);
    const rotated = rotate.json() as any;
    expect(rotated.clientSecret).toMatch(/^acs_/);

    const authOld = await authenticateAuthClient({
      projectId: 'project_1',
      clientId: created.client.clientId,
      clientSecret: created.clientSecret,
    });
    expect(authOld).toBeNull();
    const authNew = await authenticateAuthClient({
      projectId: 'project_1',
      clientId: created.client.clientId,
      clientSecret: rotated.clientSecret,
    });
    expect(authNew).not.toBeNull();

    const list = await app.inject({
      method: 'GET',
      url: '/projects/project_1/auth/clients',
      headers,
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { data: unknown[] };
    expect(listBody.data).toHaveLength(1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/auth/clients/${created.client.id}`,
      headers,
    });
    expect(del.statusCode).toBe(200);

    const listAfterDelete = await app.inject({
      method: 'GET',
      url: '/projects/project_1/auth/clients',
      headers,
    });
    expect(listAfterDelete.statusCode).toBe(200);
    expect(listAfterDelete.json()).toEqual({ data: [], nextCursor: undefined });

    await app.close();
  });
});
