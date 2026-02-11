import { AuthClientType, AuthIdentityProvider } from '@prisma/client';
import { generateToken, hashToken } from '../../../auth.js';
import { prisma } from '../../../db.js';

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
  return prisma.authProjectConfig.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });
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
  return prisma.authProjectConfig.upsert({
    where: { projectId },
    create: {
      projectId,
      nativeAuthEnabled: input.nativeAuthEnabled ?? true,
      emailPasswordEnabled: input.emailPasswordEnabled ?? true,
      accessTokenTtlMinutes: input.accessTokenTtlMinutes ?? 15,
      refreshTokenTtlDays: input.refreshTokenTtlDays ?? 30,
    },
    update: {
      nativeAuthEnabled: input.nativeAuthEnabled,
      emailPasswordEnabled: input.emailPasswordEnabled,
      accessTokenTtlMinutes: input.accessTokenTtlMinutes,
      refreshTokenTtlDays: input.refreshTokenTtlDays,
    },
  });
}

export async function createAuthEndUser(params: {
  projectId: string;
  email: string;
  displayName?: string | null;
  emailVerifiedAt?: Date | null;
}) {
  return prisma.authEndUser.create({
    data: {
      projectId: params.projectId,
      email: params.email.toLowerCase().trim(),
      displayName: params.displayName ?? null,
      emailVerifiedAt: params.emailVerifiedAt ?? null,
    },
  });
}

export async function createAuthIdentity(params: {
  projectId: string;
  endUserId: string;
  provider: AuthIdentityProvider;
  providerSubject: string;
  passwordHash?: string | null;
}) {
  return prisma.authIdentity.create({
    data: {
      projectId: params.projectId,
      endUserId: params.endUserId,
      provider: params.provider,
      providerSubject: params.providerSubject,
      passwordHash: params.passwordHash ?? null,
    },
  });
}

export async function issueAuthSessionWithRefresh(
  params: IssueAuthSessionParams,
) {
  const sessionToken = generateToken();
  const refreshToken = generateToken();
  const now = Date.now();

  const sessionExpiresAt = new Date(
    now + (params.accessTokenTtlMinutes ?? 15) * MINUTES,
  );
  const refreshExpiresAt = new Date(
    now + (params.refreshTokenTtlDays ?? 30) * DAYS,
  );

  const session = await prisma.authSession.create({
    data: {
      projectId: params.projectId,
      endUserId: params.endUserId,
      sessionTokenHash: hashToken(sessionToken),
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      expiresAt: sessionExpiresAt,
    },
  });

  const refresh = await prisma.authRefreshToken.create({
    data: {
      projectId: params.projectId,
      endUserId: params.endUserId,
      sessionId: session.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    },
  });

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
  const existing = await prisma.authRefreshToken.findFirst({
    where: {
      tokenHash: hashToken(params.refreshToken),
      ...(params.projectId ? { projectId: params.projectId } : {}),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!existing) {
    return null;
  }

  await prisma.authRefreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const nextSessionToken = generateToken();
  const nextSessionExpiry = new Date(
    Date.now() + (params.accessTokenTtlMinutes ?? 15) * MINUTES,
  );
  await prisma.authSession.update({
    where: { id: existing.sessionId },
    data: {
      sessionTokenHash: hashToken(nextSessionToken),
      expiresAt: nextSessionExpiry,
      revokedAt: null,
      lastSeenAt: new Date(),
    },
  });

  const nextRaw = generateToken();
  const replacement = await prisma.authRefreshToken.create({
    data: {
      projectId: existing.projectId,
      endUserId: existing.endUserId,
      sessionId: existing.sessionId,
      tokenHash: hashToken(nextRaw),
      expiresAt: new Date(Date.now() + (params.refreshTokenTtlDays ?? 30) * DAYS),
      rotatedFromId: existing.id,
    },
  });

  return {
    sessionToken: nextSessionToken,
    sessionExpiresAt: nextSessionExpiry,
    refreshToken: nextRaw,
    refresh: replacement,
  };
}

export async function revokeAuthSession(sessionId: string) {
  const revokedAt = new Date();
  await prisma.authSession.update({
    where: { id: sessionId },
    data: { revokedAt },
  });
  await prisma.authRefreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt },
  });
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
  return prisma.authSigningKey.create({
    data: {
      projectId: params.projectId,
      kid: params.kid,
      algorithm: params.algorithm,
      publicKeyPem: params.publicKeyPem,
      privateKeyCiphertext: new Uint8Array(params.privateKeyCiphertext),
      privateKeyIv: new Uint8Array(params.privateKeyIv),
      privateKeyTag: new Uint8Array(params.privateKeyTag),
      keyVersion: params.keyVersion,
      active: params.active ?? false,
    },
  });
}

export async function createAuthClient(params: {
  projectId: string;
  name: string;
  type: AuthClientType;
  clientId: string;
  clientSecretHash?: string | null;
  redirectUris?: string[] | null;
}) {
  return prisma.authClient.create({
    data: {
      projectId: params.projectId,
      name: params.name,
      type: params.type,
      clientId: params.clientId,
      clientSecretHash: params.clientSecretHash ?? undefined,
      redirectUrisJson: params.redirectUris ?? undefined,
    },
  });
}

export async function issuePasswordResetToken(params: {
  projectId: string;
  endUserId: string;
  ttlMinutes?: number;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 30) * MINUTES);
  const record = await prisma.authPasswordResetToken.create({
    data: {
      projectId: params.projectId,
      endUserId: params.endUserId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });
  return { token, record };
}

export async function issueEmailVerificationToken(params: {
  projectId: string;
  endUserId: string;
  ttlMinutes?: number;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 60) * MINUTES);
  const record = await prisma.authEmailVerificationToken.create({
    data: {
      projectId: params.projectId,
      endUserId: params.endUserId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });
  return { token, record };
}
