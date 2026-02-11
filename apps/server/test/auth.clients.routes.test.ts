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
  clients: [] as AuthClientRecord[],
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
    projectMember: { findUnique: async () => ({ role: state.projectRole }) },
    projectModule: { findUnique: async () => ({ enabled: true }) },
    auditLog: { create: async () => ({ id: 'audit_1' }) },
    authClient: {
      findMany: async ({ where }: any) =>
        state.clients.filter(
          (client) =>
            client.projectId === where.projectId && client.deletedAt === where.deletedAt,
        ),
      create: async ({ data }: any) => {
        const now = new Date();
        const created: AuthClientRecord = {
          id: nextId('client', state.clients.length),
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
        return created;
      },
      findFirst: async ({ where }: any) =>
        state.clients.find((client) => {
          if (where?.id && client.id !== where.id) return false;
          if (where?.projectId && client.projectId !== where.projectId) return false;
          if (where?.clientId && client.clientId !== where.clientId) return false;
          if (where?.deletedAt === null && client.deletedAt !== null) return false;
          return true;
        }) ?? null,
      update: async ({ where, data }: any) => {
        const current = state.clients.find((client) => client.id === where.id);
        if (!current) throw new Error('Client not found');
        if (Object.prototype.hasOwnProperty.call(data, 'name')) {
          current.name = data.name ?? current.name;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'redirectUrisJson')) {
          current.redirectUrisJson = data.redirectUrisJson ?? current.redirectUrisJson;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'clientSecretHash')) {
          current.clientSecretHash = data.clientSecretHash ?? current.clientSecretHash;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'deletedAt')) {
          current.deletedAt = data.deletedAt;
        }
        current.updatedAt = new Date();
        return current;
      },
    },
  },
}));

import { buildApp } from '../src/app.js';
import { authenticateAuthClient } from '../src/server/services/auth/clientCredentials.js';

describe('auth clients management routes', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
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
    const listBody = list.json() as any[];
    expect(listBody).toHaveLength(1);

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
    expect(listAfterDelete.json()).toEqual([]);

    await app.close();
  });
});
