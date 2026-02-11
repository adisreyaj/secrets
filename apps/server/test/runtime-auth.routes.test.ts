import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/auth.js';

type EndUser = {
  id: string;
  projectId: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
};

type Identity = {
  id: string;
  projectId: string;
  endUserId: string;
  provider: 'LOCAL' | 'GOOGLE' | 'GITHUB';
  providerSubject: string;
  passwordHash: string | null;
};

type Session = {
  id: string;
  projectId: string;
  endUserId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
};

type RefreshToken = {
  id: string;
  projectId: string;
  endUserId: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedFromId: string | null;
};

type SigningKey = {
  id: string;
  projectId: string;
  kid: string;
  algorithm: string;
  publicKeyPem: string;
  privateKeyCiphertext: Buffer;
  privateKeyIv: Buffer;
  privateKeyTag: Buffer;
  keyVersion: string;
  active: boolean;
  createdAt: Date;
  retiredAt: Date | null;
};

type PasswordResetToken = {
  id: string;
  projectId: string;
  endUserId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

type EmailVerificationToken = {
  id: string;
  projectId: string;
  endUserId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

type AuthProviderConfig = {
  id: string;
  projectId: string;
  provider: 'GOOGLE' | 'GITHUB';
  enabled: boolean;
  clientId: string;
  clientSecretCiphertext: Buffer;
  clientSecretIv: Buffer;
  clientSecretTag: Buffer;
  keyVersion: string;
  scopesJson: string[];
  createdAt: Date;
  updatedAt: Date;
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
  modules: [{ projectId: 'project_1', module: 'AUTH', enabled: true }],
  config: {
    projectId: 'project_1',
    nativeAuthEnabled: true,
    emailPasswordEnabled: true,
    accessTokenTtlMinutes: 15,
    refreshTokenTtlDays: 30,
  },
  endUsers: [] as EndUser[],
  identities: [] as Identity[],
  sessions: [] as Session[],
  refreshTokens: [] as RefreshToken[],
  signingKeys: [] as SigningKey[],
  passwordResetTokens: [] as PasswordResetToken[],
  emailVerificationTokens: [] as EmailVerificationToken[],
  providerConfigs: [] as AuthProviderConfig[],
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
    auditLog: { create: async () => ({ id: 'audit_1' }) },
    projectMember: { findUnique: async () => ({ role: 'ADMIN' }) },
    projectModule: {
      findUnique: async ({ where }: any) =>
        state.modules.find(
          (item) =>
            item.projectId === where.projectId_module.projectId &&
            item.module === where.projectId_module.module,
        ) ?? null,
    },
    authProjectConfig: {
      upsert: async ({ where, create, update }: any) => {
        if (state.config.projectId !== where.projectId) {
          state.config = {
            projectId: create.projectId,
            nativeAuthEnabled: create.nativeAuthEnabled ?? true,
            emailPasswordEnabled: create.emailPasswordEnabled ?? true,
            accessTokenTtlMinutes: create.accessTokenTtlMinutes ?? 15,
            refreshTokenTtlDays: create.refreshTokenTtlDays ?? 30,
          };
        } else {
          state.config = {
            ...state.config,
            ...Object.fromEntries(
              Object.entries(update).filter(([, value]) => typeof value !== 'undefined'),
            ),
          };
        }
        return state.config;
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        authEndUser: {
          create: async ({ data }: any) => {
            const created: EndUser = {
              id: nextId('end_user', state.endUsers.length),
              projectId: data.projectId,
              email: data.email,
              displayName: data.displayName ?? null,
              emailVerifiedAt: null,
              disabledAt: null,
            };
            state.endUsers.push(created);
            return created;
          },
        },
        authIdentity: {
          create: async ({ data }: any) => {
            const created: Identity = {
              id: nextId('identity', state.identities.length),
              projectId: data.projectId,
              endUserId: data.endUserId,
              provider: data.provider,
              providerSubject: data.providerSubject,
              passwordHash: data.passwordHash ?? null,
            };
            state.identities.push(created);
            return created;
          },
        },
      }),
    authEndUser: {
      create: async ({ data }: any) => {
        const created: EndUser = {
          id: nextId('end_user', state.endUsers.length),
          projectId: data.projectId,
          email: data.email,
          displayName: data.displayName ?? null,
          emailVerifiedAt: null,
          disabledAt: null,
        };
        state.endUsers.push(created);
        return created;
      },
      findFirst: async ({ where, select }: any) => {
        const found =
          state.endUsers.find(
            (candidate) =>
              candidate.projectId === where.projectId && candidate.email === where.email,
          ) ?? null;
        if (!found) return null;
        if (select?.id) {
          return { id: found.id };
        }
        return found;
      },
      update: async ({ where, data }: any) => {
        const found = state.endUsers.find((candidate) => candidate.id === where.id);
        if (!found) throw new Error('End user not found');
        if (Object.prototype.hasOwnProperty.call(data, 'emailVerifiedAt')) {
          found.emailVerifiedAt = data.emailVerifiedAt;
        }
        return found;
      },
    },
    authIdentity: {
      create: async ({ data }: any) => {
        const created: Identity = {
          id: nextId('identity', state.identities.length),
          projectId: data.projectId,
          endUserId: data.endUserId,
          provider: data.provider,
          providerSubject: data.providerSubject,
          passwordHash: data.passwordHash ?? null,
        };
        state.identities.push(created);
        return created;
      },
      findFirst: async ({ where }: any) => {
        const identity = state.identities.find(
          (candidate) =>
            candidate.projectId === where.projectId &&
            candidate.provider === where.provider &&
            candidate.providerSubject === where.providerSubject,
        );
        if (!identity) {
          return null;
        }
        const endUser = state.endUsers.find((candidate) => candidate.id === identity.endUserId);
        return {
          ...identity,
          endUser: endUser
            ? {
                id: endUser.id,
                projectId: endUser.projectId,
                email: endUser.email,
                disabledAt: endUser.disabledAt,
              }
            : null,
        };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const identity of state.identities) {
          if (
            identity.projectId === where.projectId &&
            identity.endUserId === where.endUserId &&
            identity.provider === where.provider
          ) {
            identity.passwordHash = data.passwordHash;
            count += 1;
          }
        }
        return { count };
      },
    },
    authSession: {
      create: async ({ data }: any) => {
        const created: Session = {
          id: nextId('session', state.sessions.length),
          projectId: data.projectId,
          endUserId: data.endUserId,
          sessionTokenHash: data.sessionTokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          lastSeenAt: null,
        };
        state.sessions.push(created);
        return created;
      },
      findFirst: async ({ where, include }: any) => {
        const session = state.sessions.find((candidate) => {
          if (where.projectId && candidate.projectId !== where.projectId) return false;
          if (where.sessionTokenHash && candidate.sessionTokenHash !== where.sessionTokenHash) {
            return false;
          }
          if (where.revokedAt === null && candidate.revokedAt !== null) return false;
          if (where.expiresAt?.gt && !(candidate.expiresAt > where.expiresAt.gt)) return false;
          return true;
        });
        if (!session) return null;
        if (!include?.endUser) return session;
        const endUser = state.endUsers.find((candidate) => candidate.id === session.endUserId);
        return {
          ...session,
          endUser: endUser
            ? {
                id: endUser.id,
                email: endUser.email,
                disabledAt: endUser.disabledAt,
              }
            : null,
        };
      },
      update: async ({ where, data }: any) => {
        const session = state.sessions.find((candidate) => candidate.id === where.id);
        if (!session) {
          throw new Error('Session not found');
        }
        if (Object.prototype.hasOwnProperty.call(data, 'sessionTokenHash')) {
          session.sessionTokenHash = data.sessionTokenHash;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'expiresAt')) {
          session.expiresAt = data.expiresAt;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'revokedAt')) {
          session.revokedAt = data.revokedAt;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'lastSeenAt')) {
          session.lastSeenAt = data.lastSeenAt;
        }
        return session;
      },
    },
    authRefreshToken: {
      create: async ({ data }: any) => {
        const created: RefreshToken = {
          id: nextId('refresh', state.refreshTokens.length),
          projectId: data.projectId,
          endUserId: data.endUserId,
          sessionId: data.sessionId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          rotatedFromId: data.rotatedFromId ?? null,
        };
        state.refreshTokens.push(created);
        return created;
      },
      findFirst: async ({ where }: any) =>
        state.refreshTokens.find((candidate) => {
          if (where.projectId && candidate.projectId !== where.projectId) return false;
          if (where.tokenHash && candidate.tokenHash !== where.tokenHash) return false;
          if (where.revokedAt === null && candidate.revokedAt !== null) return false;
          if (where.expiresAt?.gt && !(candidate.expiresAt > where.expiresAt.gt)) return false;
          return true;
        }) ?? null,
      update: async ({ where, data }: any) => {
        const token = state.refreshTokens.find((candidate) => candidate.id === where.id);
        if (!token) throw new Error('Refresh token not found');
        if (Object.prototype.hasOwnProperty.call(data, 'revokedAt')) {
          token.revokedAt = data.revokedAt;
        }
        return token;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const token of state.refreshTokens) {
          if (token.sessionId === where.sessionId && token.revokedAt === where.revokedAt) {
            token.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      },
    },
    authPasswordResetToken: {
      create: async ({ data }: any) => {
        const created: PasswordResetToken = {
          id: nextId('password_reset', state.passwordResetTokens.length),
          projectId: data.projectId,
          endUserId: data.endUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          consumedAt: null,
        };
        state.passwordResetTokens.push(created);
        return created;
      },
      findFirst: async ({ where }: any) =>
        state.passwordResetTokens.find((candidate) => {
          if (where.projectId && candidate.projectId !== where.projectId) return false;
          if (where.tokenHash && candidate.tokenHash !== where.tokenHash) return false;
          if (where.consumedAt === null && candidate.consumedAt !== null) return false;
          if (where.expiresAt?.gt && !(candidate.expiresAt > where.expiresAt.gt)) return false;
          return true;
        }) ?? null,
      update: async ({ where, data }: any) => {
        const found = state.passwordResetTokens.find((candidate) => candidate.id === where.id);
        if (!found) throw new Error('Password reset token not found');
        found.consumedAt = data.consumedAt;
        return found;
      },
    },
    authEmailVerificationToken: {
      create: async ({ data }: any) => {
        const created: EmailVerificationToken = {
          id: nextId('email_verify', state.emailVerificationTokens.length),
          projectId: data.projectId,
          endUserId: data.endUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          consumedAt: null,
        };
        state.emailVerificationTokens.push(created);
        return created;
      },
      findFirst: async ({ where }: any) =>
        state.emailVerificationTokens.find((candidate) => {
          if (where.projectId && candidate.projectId !== where.projectId) return false;
          if (where.tokenHash && candidate.tokenHash !== where.tokenHash) return false;
          if (where.consumedAt === null && candidate.consumedAt !== null) return false;
          if (where.expiresAt?.gt && !(candidate.expiresAt > where.expiresAt.gt)) return false;
          return true;
        }) ?? null,
      update: async ({ where, data }: any) => {
        const found = state.emailVerificationTokens.find((candidate) => candidate.id === where.id);
        if (!found) throw new Error('Email verification token not found');
        found.consumedAt = data.consumedAt;
        return found;
      },
    },
    authSigningKey: {
      findFirst: async ({ where }: any) =>
        state.signingKeys.find(
          (candidate) =>
            candidate.projectId === where.projectId &&
            candidate.active === where.active &&
            candidate.retiredAt === where.retiredAt,
        ) ?? null,
      findMany: async ({ where }: any) =>
        state.signingKeys.filter(
          (candidate) =>
            candidate.projectId === where.projectId &&
            candidate.retiredAt === where.retiredAt,
        ),
      create: async ({ data }: any) => {
        const created: SigningKey = {
          id: nextId('signing_key', state.signingKeys.length),
          projectId: data.projectId,
          kid: data.kid,
          algorithm: data.algorithm,
          publicKeyPem: data.publicKeyPem,
          privateKeyCiphertext: Buffer.from(data.privateKeyCiphertext),
          privateKeyIv: Buffer.from(data.privateKeyIv),
          privateKeyTag: Buffer.from(data.privateKeyTag),
          keyVersion: data.keyVersion,
          active: data.active,
          createdAt: new Date(),
          retiredAt: null,
        };
        state.signingKeys.push(created);
        return created;
      },
    },
    authProviderConfig: {
      findFirst: async ({ where }: any) =>
        state.providerConfigs.find((candidate) => {
          if (where.projectId && candidate.projectId !== where.projectId) return false;
          if (where.provider && candidate.provider !== where.provider) return false;
          if (typeof where.enabled === 'boolean' && candidate.enabled !== where.enabled) return false;
          return true;
        }) ?? null,
      findMany: async ({ where }: any) =>
        state.providerConfigs.filter((candidate) => candidate.projectId === where.projectId),
      upsert: async ({ where, create, update }: any) => {
        const existing = state.providerConfigs.find(
          (candidate) =>
            candidate.projectId === where.projectId_provider.projectId &&
            candidate.provider === where.projectId_provider.provider,
        );
        if (existing) {
          existing.enabled = typeof update.enabled === 'boolean' ? update.enabled : existing.enabled;
          existing.clientId = update.clientId ?? existing.clientId;
          existing.clientSecretCiphertext =
            update.clientSecretCiphertext ?? existing.clientSecretCiphertext;
          existing.clientSecretIv = update.clientSecretIv ?? existing.clientSecretIv;
          existing.clientSecretTag = update.clientSecretTag ?? existing.clientSecretTag;
          existing.keyVersion = update.keyVersion ?? existing.keyVersion;
          existing.scopesJson = update.scopesJson ?? existing.scopesJson;
          existing.updatedAt = new Date();
          return existing;
        }
        const created: AuthProviderConfig = {
          id: nextId('provider', state.providerConfigs.length),
          projectId: create.projectId,
          provider: create.provider,
          enabled: create.enabled,
          clientId: create.clientId,
          clientSecretCiphertext: Buffer.from(create.clientSecretCiphertext),
          clientSecretIv: Buffer.from(create.clientSecretIv),
          clientSecretTag: Buffer.from(create.clientSecretTag),
          keyVersion: create.keyVersion,
          scopesJson: create.scopesJson ?? [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.providerConfigs.push(created);
        return created;
      },
      findUnique: async ({ where }: any) =>
        state.providerConfigs.find((candidate) => candidate.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const found = state.providerConfigs.find((candidate) => candidate.id === where.id);
        if (!found) throw new Error('Provider config not found');
        if (Object.prototype.hasOwnProperty.call(data, 'enabled')) {
          found.enabled = data.enabled;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'clientId')) {
          found.clientId = data.clientId;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'clientSecretCiphertext')) {
          found.clientSecretCiphertext = data.clientSecretCiphertext;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'clientSecretIv')) {
          found.clientSecretIv = data.clientSecretIv;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'clientSecretTag')) {
          found.clientSecretTag = data.clientSecretTag;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'keyVersion')) {
          found.keyVersion = data.keyVersion;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'scopesJson')) {
          found.scopesJson = data.scopesJson;
        }
        found.updatedAt = new Date();
        return found;
      },
    },
  },
}));

import { buildApp } from '../src/app.js';

describe('runtime auth routes', () => {
  beforeAll(() => {
    process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
  });

  beforeEach(() => {
    state.endUsers = [];
    state.identities = [];
    state.sessions = [];
    state.refreshTokens = [];
    state.signingKeys = [];
    state.passwordResetTokens = [];
    state.emailVerificationTokens = [];
    state.providerConfigs = [];
    state.config = {
      projectId: 'project_1',
      nativeAuthEnabled: true,
      emailPasswordEnabled: true,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
    };
  });

  it('supports signup, login, refresh, and logout flows', async () => {
    const app = await buildApp();
    const headers = { origin: 'http://localhost:5173' };

    const signup = await app.inject({
      method: 'POST',
      url: '/runtime/auth/signup',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'user@example.com',
        password: 'StrongPass123!',
      },
    });
    expect(signup.statusCode).toBe(201);
    const signupBody = signup.json() as any;
    expect(signupBody.accessToken).toBeTruthy();
    expect(signupBody.sessionToken).toBeTruthy();
    expect(signupBody.refreshToken).toBeTruthy();

    const badLogin = await app.inject({
      method: 'POST',
      url: '/runtime/auth/login',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'user@example.com',
        password: 'wrong-password',
      },
    });
    expect(badLogin.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/runtime/auth/login',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'user@example.com',
        password: 'StrongPass123!',
      },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json() as any;
    expect(loginBody.accessToken).toBeTruthy();
    expect(loginBody.sessionToken).toBeTruthy();
    expect(loginBody.refreshToken).toBeTruthy();

    const refresh = await app.inject({
      method: 'POST',
      url: '/runtime/auth/token/refresh',
      headers,
      payload: {
        projectId: 'project_1',
        refreshToken: loginBody.refreshToken,
      },
    });
    expect(refresh.statusCode).toBe(200);
    const refreshBody = refresh.json() as any;
    expect(refreshBody.accessToken).toBeTruthy();
    expect(refreshBody.sessionToken).toBeTruthy();
    expect(refreshBody.refreshToken).toBeTruthy();

    const jwks = await app.inject({
      method: 'GET',
      url: '/runtime/auth/jwks?projectId=project_1',
      headers,
    });
    expect(jwks.statusCode).toBe(200);
    const jwksBody = jwks.json() as { keys: Array<{ kid: string; kty: string }> };
    expect(jwksBody.keys.length).toBeGreaterThan(0);
    expect(jwksBody.keys[0]?.kty).toBe('RSA');
    expect(jwksBody.keys[0]?.kid).toBeTruthy();

    const logout = await app.inject({
      method: 'POST',
      url: '/runtime/auth/logout',
      headers: {
        ...headers,
        authorization: `Bearer ${refreshBody.sessionToken}`,
      },
      payload: { projectId: 'project_1' },
    });
    expect(logout.statusCode).toBe(200);

    const logoutAgain = await app.inject({
      method: 'POST',
      url: '/runtime/auth/logout',
      headers: {
        ...headers,
        authorization: `Bearer ${refreshBody.sessionToken}`,
      },
      payload: { projectId: 'project_1' },
    });
    expect(logoutAgain.statusCode).toBe(401);

    await app.close();
  });

  it('supports password reset and email verification token flows', async () => {
    const app = await buildApp();
    const headers = { origin: 'http://localhost:5173' };

    const signup = await app.inject({
      method: 'POST',
      url: '/runtime/auth/signup',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'verify@example.com',
        password: 'StrongPass123!',
      },
    });
    expect(signup.statusCode).toBe(201);

    const forgot = await app.inject({
      method: 'POST',
      url: '/runtime/auth/password/forgot',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'verify@example.com',
      },
    });
    expect(forgot.statusCode).toBe(200);
    const forgotBody = forgot.json() as any;
    expect(forgotBody.resetToken).toBeTruthy();

    const reset = await app.inject({
      method: 'POST',
      url: '/runtime/auth/password/reset',
      headers,
      payload: {
        projectId: 'project_1',
        token: forgotBody.resetToken,
        password: 'NewStrongPass123!',
      },
    });
    expect(reset.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/runtime/auth/login',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'verify@example.com',
        password: 'NewStrongPass123!',
      },
    });
    expect(login.statusCode).toBe(200);

    const verifyRequest = await app.inject({
      method: 'POST',
      url: '/runtime/auth/email/verify/request',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'verify@example.com',
      },
    });
    expect(verifyRequest.statusCode).toBe(200);
    const verifyBody = verifyRequest.json() as any;
    expect(verifyBody.verificationToken).toBeTruthy();

    const confirm = await app.inject({
      method: 'POST',
      url: '/runtime/auth/email/verify/confirm',
      headers,
      payload: {
        projectId: 'project_1',
        token: verifyBody.verificationToken,
      },
    });
    expect(confirm.statusCode).toBe(200);
    expect(
      state.endUsers.find((candidate) => candidate.email === 'verify@example.com')
        ?.emailVerifiedAt,
    ).toBeTruthy();

    await app.close();
  });

  it('supports google oauth start and callback via mock profile in tests', async () => {
    const app = await buildApp();
    const headers = { origin: 'http://localhost:5173', authorization: 'Bearer mgmt-token' };

    const providerCreate = await app.inject({
      method: 'POST',
      url: '/projects/project_1/auth/providers',
      headers,
      payload: {
        provider: 'google',
        enabled: true,
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
      },
    });
    expect(providerCreate.statusCode).toBe(201);

    const start = await app.inject({
      method: 'GET',
      url: '/runtime/auth/oauth/google/start?projectId=project_1',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(start.statusCode).toBe(200);
    const startBody = start.json() as { state: string; authUrl: string };
    expect(startBody.state).toBeTruthy();
    expect(startBody.authUrl).toContain('accounts.google.com');

    const callback = await app.inject({
      method: 'GET',
      url: `/runtime/auth/oauth/google/callback?state=${encodeURIComponent(startBody.state)}&mockEmail=test-google@example.com&mockSub=sub_google_1`,
      headers: { origin: 'http://localhost:5173' },
    });
    expect(callback.statusCode).toBe(200);
    const callbackBody = callback.json() as { provider: string; accessToken?: string };
    expect(callbackBody.provider).toBe('google');
    expect(callbackBody.accessToken).toBeTruthy();

    await app.close();
  });

  it('locks repeated bad logins with 429 response', async () => {
    const app = await buildApp();
    const headers = { origin: 'http://localhost:5173' };

    const signup = await app.inject({
      method: 'POST',
      url: '/runtime/auth/signup',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'lockout@example.com',
        password: 'StrongPass123!',
      },
    });
    expect(signup.statusCode).toBe(201);

    for (let index = 0; index < 4; index += 1) {
      const attempt = await app.inject({
        method: 'POST',
        url: '/runtime/auth/login',
        headers,
        payload: {
          projectId: 'project_1',
          email: 'lockout@example.com',
          password: 'wrong-password',
        },
      });
      expect(attempt.statusCode).toBe(401);
    }

    const lockedAttempt = await app.inject({
      method: 'POST',
      url: '/runtime/auth/login',
      headers,
      payload: {
        projectId: 'project_1',
        email: 'lockout@example.com',
        password: 'wrong-password',
      },
    });
    expect(lockedAttempt.statusCode).toBe(429);
    expect((lockedAttempt.json() as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(0);

    await app.close();
  });
});
