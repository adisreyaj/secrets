import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthIdentityProvider } from '@prisma/client';

const {
  txEndUserCreate,
  txIdentityCreate,
  identityFindFirst,
  identityUpdateMany,
} = vi.hoisted(() => ({
  txEndUserCreate: vi.fn(),
  txIdentityCreate: vi.fn(),
  identityFindFirst: vi.fn(),
  identityUpdateMany: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        authEndUser: { create: txEndUserCreate },
        authIdentity: { create: txIdentityCreate },
      }),
    authIdentity: {
      findFirst: identityFindFirst,
      updateMany: identityUpdateMany,
    },
  },
}));

import {
  registerLocalIdentity,
  rotateLocalPassword,
  verifyLocalCredentials,
} from '../src/server/services/auth/localIdentity.js';
import { hashPassword } from '../src/auth.js';

describe('auth local identity service', () => {
  beforeEach(() => {
    txEndUserCreate.mockReset();
    txIdentityCreate.mockReset();
    identityFindFirst.mockReset();
    identityUpdateMany.mockReset();
  });

  it('registers end user and local identity in one transaction', async () => {
    txEndUserCreate.mockResolvedValue({
      id: 'end_user_1',
      projectId: 'project_1',
      email: 'user@example.com',
    });
    txIdentityCreate.mockResolvedValue({
      id: 'identity_1',
      provider: AuthIdentityProvider.LOCAL,
    });

    await registerLocalIdentity({
      projectId: 'project_1',
      email: 'User@Example.com ',
      password: 'StrongPass123!',
      displayName: 'User',
    });

    expect(txEndUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'user@example.com',
          projectId: 'project_1',
        }),
      }),
    );
    expect(txIdentityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: AuthIdentityProvider.LOCAL,
          providerSubject: 'user@example.com',
          endUserId: 'end_user_1',
        }),
      }),
    );
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
    identityUpdateMany.mockResolvedValue({ count: 1 });

    const result = await rotateLocalPassword({
      projectId: 'project_1',
      endUserId: 'end_user_1',
      nextPassword: 'NewStrongPass123!',
    });

    expect(result).toEqual({ count: 1 });
    expect(identityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: AuthIdentityProvider.LOCAL,
          endUserId: 'end_user_1',
          projectId: 'project_1',
        }),
        data: expect.objectContaining({
          passwordHash: expect.any(String),
        }),
      }),
    );
  });
});
