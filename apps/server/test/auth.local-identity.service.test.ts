import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthIdentityProvider } from '../src/db/index.js';

const {
  insertReturning,
  identityFindFirst,
  updateWhere,
} = vi.hoisted(() => ({
  insertReturning: vi.fn(),
  identityFindFirst: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();

  const makeInsert = () => {
    const chain: any = {
      values: vi.fn(() => chain),
      returning: vi.fn(async () => insertReturning()),
    };
    return chain;
  };

  const makeUpdate = () => {
    const chain: any = {
      set: vi.fn(() => chain),
      where: vi.fn(async (...args: unknown[]) => updateWhere(...args)),
    };
    return chain;
  };

  const tx = {
    insert: vi.fn(() => makeInsert()),
  };

  return {
    ...actual,
    db: {
      transaction: async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
      query: {
        authIdentities: { findFirst: identityFindFirst },
      },
      update: vi.fn(() => makeUpdate()),
      insert: vi.fn(() => makeInsert()),
    },
  };
});

import {
  registerLocalIdentity,
  rotateLocalPassword,
  verifyLocalCredentials,
} from '../src/server/services/auth/localIdentity.js';
import { hashPassword } from '../src/auth.js';

describe('auth local identity service', () => {
  beforeEach(() => {
    insertReturning.mockReset();
    identityFindFirst.mockReset();
    updateWhere.mockReset();
  });

  it('registers end user and local identity in one transaction', async () => {
    insertReturning
      .mockResolvedValueOnce([
        {
          id: 'end_user_1',
          projectId: 'project_1',
          email: 'user@example.com',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'identity_1',
          provider: AuthIdentityProvider.LOCAL,
        },
      ]);

    const result = await registerLocalIdentity({
      projectId: 'project_1',
      email: 'User@Example.com ',
      password: 'StrongPass123!',
      displayName: 'User',
    });

    expect(result.endUser.email).toBe('user@example.com');
    expect(result.identity.provider).toBe(AuthIdentityProvider.LOCAL);
    expect(insertReturning).toHaveBeenCalledTimes(2);
  });

  it('returns invalid credentials for unknown user', async () => {
    identityFindFirst.mockResolvedValue(null);

    const result = await verifyLocalCredentials({
      projectId: 'project_1',
      email: 'missing@example.com',
      password: 'any',
    });

    expect(result).toEqual({ status: 'invalid_credentials' });
  });

  it('returns disabled when account is disabled', async () => {
    identityFindFirst.mockResolvedValue({
      passwordHash: 'hashed_password',
      endUser: {
        id: 'end_user_1',
        projectId: 'project_1',
        email: 'user@example.com',
        disabledAt: new Date(),
      },
    });

    const result = await verifyLocalCredentials({
      projectId: 'project_1',
      email: 'user@example.com',
      password: 'StrongPass123!',
    });

    expect(result).toEqual({ status: 'disabled' });
  });

  it('returns invalid credentials for bad password', async () => {
    identityFindFirst.mockResolvedValue({
      passwordHash:
        '$2b$10$phU0V37A.HKOn7m4.6a8u.2Gv57rVj8iG6CezD8YQlygmfQhijWJm',
      endUser: {
        id: 'end_user_1',
        projectId: 'project_1',
        email: 'user@example.com',
        disabledAt: null,
      },
    });

    const result = await verifyLocalCredentials({
      projectId: 'project_1',
      email: 'user@example.com',
      password: 'wrong-password',
    });

    expect(result).toEqual({ status: 'invalid_credentials' });
  });

  it('returns end user when password is valid', async () => {
    const passwordHash = await hashPassword('StrongPass123!');
    identityFindFirst.mockResolvedValue({
      passwordHash,
      endUser: {
        id: 'end_user_1',
        projectId: 'project_1',
        email: 'user@example.com',
        disabledAt: null,
      },
    });

    const result = await verifyLocalCredentials({
      projectId: 'project_1',
      email: 'user@example.com',
      password: 'StrongPass123!',
    });

    expect(result).toEqual({
      status: 'ok',
      endUser: {
        id: 'end_user_1',
        projectId: 'project_1',
        email: 'user@example.com',
      },
    });
  });

  it('rotates local password hash for an end user', async () => {
    updateWhere.mockResolvedValue({ changes: 1 });

    await rotateLocalPassword({
      projectId: 'project_1',
      endUserId: 'end_user_1',
      nextPassword: 'NewStrongPass123!',
    });

    expect(updateWhere).toHaveBeenCalled();
  });
});
