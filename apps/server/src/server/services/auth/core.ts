import { and, eq, gt, isNull } from 'drizzle-orm';
import { generateToken, hashToken } from '../../../auth.js';
import {
  AuthClientType,
  AuthIdentityProvider,
  authClients,
  authEmailVerificationTokens,
  authEndUsers,
  authIdentities,
  authPasswordResetTokens,
  authProjectConfigs,
  authRefreshTokens,
  authSessions,
  authSigningKeys,
  db,
  type AuthClientType as AuthClientTypeT,
  type AuthIdentityProvider as AuthIdentityProviderT,
} from '../../../db/index.js';

const MINUTES = 60 * 1000;
const DAYS = 24 * 60 * MINUTES;

export type IssueAuthSessionParams = {
  projectId: string;
  endUserId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  accessTokenTtlMinutes?: number;
  refreshTokenTtlDays?: number;
};

export async function ensureAuthProjectConfig(projectId: string) {
  const existing = await db.query.authProjectConfigs.findFirst({
    where: eq(authProjectConfigs.projectId, projectId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(authProjectConfigs)
    .values({ projectId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const again = await db.query.authProjectConfigs.findFirst({
    where: eq(authProjectConfigs.projectId, projectId),
  });
  if (!again) throw new Error('Failed to ensure auth project config');
  return again;
}

export async function updateAuthProjectConfig(
  projectId: string,
  input: {
    nativeAuthEnabled?: boolean;
    emailPasswordEnabled?: boolean;
    accessTokenTtlMinutes?: number;
    refreshTokenTtlDays?: number;
  },
) {
  const [row] = await db
    .insert(authProjectConfigs)
    .values({
      projectId,
      nativeAuthEnabled: input.nativeAuthEnabled ?? true,
      emailPasswordEnabled: input.emailPasswordEnabled ?? true,
      accessTokenTtlMinutes: input.accessTokenTtlMinutes ?? 15,
      refreshTokenTtlDays: input.refreshTokenTtlDays ?? 30,
    })
    .onConflictDoUpdate({
      target: authProjectConfigs.projectId,
      set: {
        nativeAuthEnabled: input.nativeAuthEnabled,
        emailPasswordEnabled: input.emailPasswordEnabled,
        accessTokenTtlMinutes: input.accessTokenTtlMinutes,
        refreshTokenTtlDays: input.refreshTokenTtlDays,
      },
    })
    .returning();
  return row;
}

export async function createAuthEndUser(params: {
  projectId: string;
  email: string;
  displayName?: string | null;
  emailVerifiedAt?: Date | null;
}) {
  const [row] = await db
    .insert(authEndUsers)
    .values({
      projectId: params.projectId,
      email: params.email.toLowerCase().trim(),
      displayName: params.displayName ?? null,
      emailVerifiedAt: params.emailVerifiedAt ?? null,
    })
    .returning();
  return row;
}

export async function createAuthIdentity(params: {
  projectId: string;
  endUserId: string;
  provider: AuthIdentityProviderT;
  providerSubject: string;
  passwordHash?: string | null;
}) {
  const [row] = await db
    .insert(authIdentities)
    .values({
      projectId: params.projectId,
      endUserId: params.endUserId,
      provider: params.provider,
      providerSubject: params.providerSubject,
      passwordHash: params.passwordHash ?? null,
    })
    .returning();
  return row;
}

export async function issueAuthSessionWithRefresh(params: IssueAuthSessionParams) {
  const sessionToken = generateToken();
  const refreshToken = generateToken();
  const now = Date.now();

  const sessionExpiresAt = new Date(
    now + (params.accessTokenTtlMinutes ?? 15) * MINUTES,
  );
  const refreshExpiresAt = new Date(
    now + (params.refreshTokenTtlDays ?? 30) * DAYS,
  );

  const [session] = await db
    .insert(authSessions)
    .values({
      projectId: params.projectId,
      endUserId: params.endUserId,
      sessionTokenHash: hashToken(sessionToken),
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      expiresAt: sessionExpiresAt,
    })
    .returning();

  const [refresh] = await db
    .insert(authRefreshTokens)
    .values({
      projectId: params.projectId,
      endUserId: params.endUserId,
      sessionId: session.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    })
    .returning();

  return {
    session,
    refresh,
    sessionToken,
    refreshToken,
    sessionExpiresAt,
    refreshExpiresAt,
  };
}

export async function rotateAuthRefreshToken(params: {
  refreshToken: string;
  projectId?: string;
  accessTokenTtlMinutes?: number;
  refreshTokenTtlDays?: number;
}) {
  const existing = await db.query.authRefreshTokens.findFirst({
    where: and(
      eq(authRefreshTokens.tokenHash, hashToken(params.refreshToken)),
      params.projectId ? eq(authRefreshTokens.projectId, params.projectId) : undefined,
      isNull(authRefreshTokens.revokedAt),
      gt(authRefreshTokens.expiresAt, new Date()),
    ),
  });
  if (!existing) {
    return null;
  }

  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(authRefreshTokens.id, existing.id));

  const nextSessionToken = generateToken();
  const nextSessionExpiry = new Date(
    Date.now() + (params.accessTokenTtlMinutes ?? 15) * MINUTES,
  );
  await db
    .update(authSessions)
    .set({
      sessionTokenHash: hashToken(nextSessionToken),
      expiresAt: nextSessionExpiry,
      revokedAt: null,
      lastSeenAt: new Date(),
    })
    .where(eq(authSessions.id, existing.sessionId));

  const nextRaw = generateToken();
  const [replacement] = await db
    .insert(authRefreshTokens)
    .values({
      projectId: existing.projectId,
      endUserId: existing.endUserId,
      sessionId: existing.sessionId,
      tokenHash: hashToken(nextRaw),
      expiresAt: new Date(Date.now() + (params.refreshTokenTtlDays ?? 30) * DAYS),
      rotatedFromId: existing.id,
    })
    .returning();

  return {
    sessionToken: nextSessionToken,
    sessionExpiresAt: nextSessionExpiry,
    refreshToken: nextRaw,
    refresh: replacement,
  };
}

export async function revokeAuthSession(sessionId: string) {
  const revokedAt = new Date();
  await db.update(authSessions).set({ revokedAt }).where(eq(authSessions.id, sessionId));
  await db
    .update(authRefreshTokens)
    .set({ revokedAt })
    .where(and(eq(authRefreshTokens.sessionId, sessionId), isNull(authRefreshTokens.revokedAt)));
}

export async function createAuthSigningKey(params: {
  projectId: string;
  kid: string;
  algorithm: string;
  publicKeyPem: string;
  privateKeyCiphertext: Buffer;
  privateKeyIv: Buffer;
  privateKeyTag: Buffer;
  keyVersion: string;
  active?: boolean;
}) {
  const [row] = await db
    .insert(authSigningKeys)
    .values({
      projectId: params.projectId,
      kid: params.kid,
      algorithm: params.algorithm,
      publicKeyPem: params.publicKeyPem,
      privateKeyCiphertext: params.privateKeyCiphertext,
      privateKeyIv: params.privateKeyIv,
      privateKeyTag: params.privateKeyTag,
      keyVersion: params.keyVersion,
      active: params.active ?? false,
    })
    .returning();
  return row;
}

export async function createAuthClient(params: {
  projectId: string;
  name: string;
  type: AuthClientTypeT;
  clientId: string;
  clientSecretHash?: string | null;
  redirectUris?: string[] | null;
}) {
  const [row] = await db
    .insert(authClients)
    .values({
      projectId: params.projectId,
      name: params.name,
      type: params.type,
      clientId: params.clientId,
      clientSecretHash: params.clientSecretHash ?? null,
      redirectUrisJson: params.redirectUris ?? null,
    })
    .returning();
  return row;
}

export async function issuePasswordResetToken(params: {
  projectId: string;
  endUserId: string;
  ttlMinutes?: number;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 30) * MINUTES);
  const [record] = await db
    .insert(authPasswordResetTokens)
    .values({
      projectId: params.projectId,
      endUserId: params.endUserId,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .returning();
  return { token, record };
}

export async function issueEmailVerificationToken(params: {
  projectId: string;
  endUserId: string;
  ttlMinutes?: number;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 60) * MINUTES);
  const [record] = await db
    .insert(authEmailVerificationTokens)
    .values({
      projectId: params.projectId,
      endUserId: params.endUserId,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .returning();
  return { token, record };
}

export { AuthClientType, AuthIdentityProvider };
