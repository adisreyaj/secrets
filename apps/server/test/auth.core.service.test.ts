import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/auth.js';

const {
  authProjectConfigUpsert,
  authSessionCreate,
  authSessionUpdate,
  authRefreshCreate,
  authRefreshFindFirst,
  authRefreshUpdate,
  authPasswordResetCreate,
} = vi.hoisted(() => ({
  authProjectConfigUpsert: vi.fn(),
  authSessionCreate: vi.fn(),
  authSessionUpdate: vi.fn(),
  authRefreshCreate: vi.fn(),
  authRefreshFindFirst: vi.fn(),
  authRefreshUpdate: vi.fn(),
  authPasswordResetCreate: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    authProjectConfig: {
      upsert: authProjectConfigUpsert,
    },
    authSession: {
      create: authSessionCreate,
      update: authSessionUpdate,
    },
    authRefreshToken: {
      create: authRefreshCreate,
      findFirst: authRefreshFindFirst,
      update: authRefreshUpdate,
      updateMany: vi.fn(),
    },
    authPasswordResetToken: {
      create: authPasswordResetCreate,
    },
    authEmailVerificationToken: {
      create: vi.fn(),
    },
    authEndUser: {
      create: vi.fn(),
    },
    authIdentity: {
      create: vi.fn(),
    },
    authSigningKey: {
      create: vi.fn(),
    },
    authClient: {
      create: vi.fn(),
    },
  },
}));

import {
  ensureAuthProjectConfig,
  issueAuthSessionWithRefresh,
  issuePasswordResetToken,
  rotateAuthRefreshToken,
  updateAuthProjectConfig,
} from '../src/server/services/auth/core.js';

describe('auth core service', () => {
  beforeEach(() => {
    authProjectConfigUpsert.mockReset();
    authSessionCreate.mockReset();
    authRefreshCreate.mockReset();
    authRefreshFindFirst.mockReset();
    authRefreshUpdate.mockReset();
    authSessionUpdate.mockReset();
    authPasswordResetCreate.mockReset();
  });

  it('ensures and updates project auth config', async () => {
    authProjectConfigUpsert.mockResolvedValue({
      id: 'cfg_1',
      projectId: 'project_1',
      nativeAuthEnabled: true,
      emailPasswordEnabled: true,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
    });

    await ensureAuthProjectConfig('project_1');
    await updateAuthProjectConfig('project_1', { accessTokenTtlMinutes: 20 });

    expect(authProjectConfigUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { projectId: 'project_1' },
        create: { projectId: 'project_1' },
      }),
    );
    expect(authProjectConfigUpsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { projectId: 'project_1' },
        update: expect.objectContaining({ accessTokenTtlMinutes: 20 }),
      }),
    );
  });

  it('issues hashed session and refresh tokens with ttl windows', async () => {
    authSessionCreate.mockResolvedValue({ id: 'session_1' });
    authRefreshCreate.mockResolvedValue({ id: 'refresh_1' });

    const issued = await issueAuthSessionWithRefresh({
      projectId: 'project_1',
      endUserId: 'end_user_1',
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
    });

    expect(authSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionTokenHash: hashToken(issued.sessionToken),
          projectId: 'project_1',
          endUserId: 'end_user_1',
        }),
      }),
    );
    expect(authRefreshCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: hashToken(issued.refreshToken),
          sessionId: 'session_1',
        }),
      }),
    );
  });

  it('rotates refresh token by revoking old token and issuing replacement', async () => {
    authRefreshFindFirst.mockResolvedValue({
      id: 'refresh_old',
      projectId: 'project_1',
      endUserId: 'end_user_1',
      sessionId: 'session_1',
    });
    authRefreshUpdate.mockResolvedValue({ id: 'refresh_old' });
    authRefreshCreate.mockResolvedValue({ id: 'refresh_new' });

    const rotated = await rotateAuthRefreshToken({
      refreshToken: 'old_token',
      projectId: 'project_1',
      refreshTokenTtlDays: 10,
    });

    expect(rotated).not.toBeNull();
    expect(authSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session_1' } }),
    );
    expect(authRefreshUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'refresh_old' } }),
    );
    expect(authRefreshCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rotatedFromId: 'refresh_old',
          tokenHash: hashToken(rotated!.refreshToken),
        }),
      }),
    );
  });

  it('issues password reset token with hashed persisted value', async () => {
    authPasswordResetCreate.mockResolvedValue({ id: 'prt_1' });
    const issued = await issuePasswordResetToken({
      projectId: 'project_1',
      endUserId: 'end_user_1',
      ttlMinutes: 45,
    });

    expect(authPasswordResetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: hashToken(issued.token),
          projectId: 'project_1',
          endUserId: 'end_user_1',
        }),
      }),
    );
  });
});
