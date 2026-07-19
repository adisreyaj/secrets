import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/auth.js';

const {
  findFirst,
  insertReturning,
  updateWhere,
} = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertReturning: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();

  const makeInsert = () => {
    const chain: any = {
      values: vi.fn(() => chain),
      onConflictDoNothing: vi.fn(() => chain),
      onConflictDoUpdate: vi.fn(() => chain),
      returning: vi.fn(async () => insertReturning()),
    };
    return chain;
  };

  const makeUpdate = () => {
    const chain: any = {
      set: vi.fn(() => chain),
      where: vi.fn(async () => updateWhere()),
    };
    return chain;
  };

  return {
    ...actual,
    db: {
      query: {
        authProjectConfigs: { findFirst },
        authRefreshTokens: { findFirst },
      },
      insert: vi.fn(() => makeInsert()),
      update: vi.fn(() => makeUpdate()),
    },
  };
});

import {
  ensureAuthProjectConfig,
  issueAuthSessionWithRefresh,
  issuePasswordResetToken,
  rotateAuthRefreshToken,
  updateAuthProjectConfig,
} from '../src/server/services/auth/core.js';

describe('auth core service', () => {
  beforeEach(() => {
    findFirst.mockReset();
    insertReturning.mockReset();
    updateWhere.mockReset();
  });

  it('ensures and updates project auth config', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'cfg_1',
      projectId: 'project_1',
      nativeAuthEnabled: true,
      emailPasswordEnabled: true,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
    });
    insertReturning.mockResolvedValueOnce([
      {
        id: 'cfg_1',
        projectId: 'project_1',
        accessTokenTtlMinutes: 20,
      },
    ]);

    const ensured = await ensureAuthProjectConfig('project_1');
    expect(ensured.projectId).toBe('project_1');

    const updated = await updateAuthProjectConfig('project_1', {
      accessTokenTtlMinutes: 20,
    });
    expect(updated.accessTokenTtlMinutes).toBe(20);
    expect(insertReturning).toHaveBeenCalled();
  });

  it('issues hashed session and refresh tokens with ttl windows', async () => {
    insertReturning
      .mockResolvedValueOnce([
        {
          id: 'session_1',
          projectId: 'project_1',
          endUserId: 'eu_1',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'refresh_1',
          sessionId: 'session_1',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

    const issued = await issueAuthSessionWithRefresh({
      projectId: 'project_1',
      endUserId: 'eu_1',
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
    });

    expect(issued.session.id).toBe('session_1');
    expect(issued.refresh.id).toBe('refresh_1');
    expect(issued.sessionToken).toBeTruthy();
    expect(issued.refreshToken).toBeTruthy();
    expect(insertReturning).toHaveBeenCalledTimes(2);
  });

  it('rotates refresh token by revoking old token and issuing replacement', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'refresh_old',
      projectId: 'project_1',
      endUserId: 'eu_1',
      sessionId: 'session_1',
      tokenHash: hashToken('old-refresh'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    insertReturning.mockResolvedValueOnce([
      {
        id: 'refresh_new',
        sessionId: 'session_1',
        rotatedFromId: 'refresh_old',
      },
    ]);

    const rotated = await rotateAuthRefreshToken({
      refreshToken: 'old-refresh',
      projectId: 'project_1',
    });

    expect(rotated).not.toBeNull();
    expect(rotated?.refresh.id).toBe('refresh_new');
    expect(updateWhere).toHaveBeenCalled();
  });

  it('issues password reset token with hashed persisted value', async () => {
    insertReturning.mockResolvedValueOnce([
      {
        id: 'prt_1',
        projectId: 'project_1',
        endUserId: 'eu_1',
        tokenHash: 'hashed',
      },
    ]);

    const issued = await issuePasswordResetToken({
      projectId: 'project_1',
      endUserId: 'eu_1',
    });

    expect(issued.token).toBeTruthy();
    expect(issued.record.id).toBe('prt_1');
    expect(insertReturning).toHaveBeenCalled();
  });
});
