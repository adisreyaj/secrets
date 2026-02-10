import { Prisma, ProjectModuleKey } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  ensureAuthProjectConfig,
  issueAuthSessionWithRefresh,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  revokeAuthSession,
  rotateAuthRefreshToken,
} from '../services/auth/core.js';
import {
  rotateLocalPassword,
  registerLocalIdentity,
  verifyLocalCredentials,
} from '../services/auth/localIdentity.js';
import { buildProjectJwks, signProjectAccessToken } from '../services/auth/jwt.js';
import { hashToken } from '../../auth.js';
import { prisma } from '../../db.js';
import {
  buildEmailVerificationEmail,
  buildPasswordResetEmail,
  createAuthEmailProvider,
} from '../services/auth/email.js';
import {
  requireProjectAuthSession,
  requireProjectModuleEnabled,
} from '../auth/guards.js';

function isPrismaUniqueError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const authEmailProvider = createAuthEmailProvider();

  app.post('/runtime/auth/signup', async (request, reply) => {
    const body = request.body as
      | {
          projectId?: string;
          email?: string;
          password?: string;
          displayName?: string | null;
        }
      | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim();
    const password = body?.password;
    if (!projectId || !email || !password) {
      reply.code(400).send({ error: 'projectId, email, and password are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const config = await ensureAuthProjectConfig(projectId);
    if (!config.nativeAuthEnabled || !config.emailPasswordEnabled) {
      reply.code(403).send({ error: 'Email/password signup is disabled for this project' });
      return;
    }

    try {
      const { endUser } = await registerLocalIdentity({
        projectId,
        email,
        password,
        displayName: body?.displayName ?? null,
      });
      const issued = await issueAuthSessionWithRefresh({
        projectId,
        endUserId: endUser.id,
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        accessTokenTtlMinutes: config.accessTokenTtlMinutes,
        refreshTokenTtlDays: config.refreshTokenTtlDays,
      });
      const access = await signProjectAccessToken({
        projectId,
        endUserId: endUser.id,
        sessionId: issued.session.id,
        expiresInMinutes: config.accessTokenTtlMinutes,
      });

      reply.code(201).send({
        endUser: {
          id: endUser.id,
          projectId: endUser.projectId,
          email: endUser.email,
          displayName: endUser.displayName,
        },
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        sessionToken: issued.sessionToken,
        refreshToken: issued.refreshToken,
        sessionExpiresAt: issued.sessionExpiresAt.toISOString(),
        refreshExpiresAt: issued.refreshExpiresAt.toISOString(),
      });
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        reply.code(409).send({ error: 'Email already exists for this project' });
        return;
      }
      throw error;
    }
  });

  app.post('/runtime/auth/login', async (request, reply) => {
    const body = request.body as
      | {
          projectId?: string;
          email?: string;
          password?: string;
        }
      | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim();
    const password = body?.password;
    if (!projectId || !email || !password) {
      reply.code(400).send({ error: 'projectId, email, and password are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const config = await ensureAuthProjectConfig(projectId);
    if (!config.nativeAuthEnabled || !config.emailPasswordEnabled) {
      reply.code(403).send({ error: 'Email/password login is disabled for this project' });
      return;
    }

    const verified = await verifyLocalCredentials({ projectId, email, password });
    if (verified.status === 'disabled') {
      reply.code(403).send({ error: 'Account is disabled' });
      return;
    }
    if (verified.status !== 'ok') {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const issued = await issueAuthSessionWithRefresh({
      projectId,
      endUserId: verified.endUser.id,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
      accessTokenTtlMinutes: config.accessTokenTtlMinutes,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
    });
    const access = await signProjectAccessToken({
      projectId,
      endUserId: verified.endUser.id,
      sessionId: issued.session.id,
      expiresInMinutes: config.accessTokenTtlMinutes,
    });

    reply.send({
      endUser: verified.endUser,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      sessionToken: issued.sessionToken,
      refreshToken: issued.refreshToken,
      sessionExpiresAt: issued.sessionExpiresAt.toISOString(),
      refreshExpiresAt: issued.refreshExpiresAt.toISOString(),
    });
  });

  app.post('/runtime/auth/logout', async (request, reply) => {
    const body = request.body as { projectId?: string } | undefined;
    const projectId = body?.projectId?.trim();
    if (!projectId) {
      reply.code(400).send({ error: 'projectId is required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const session = await requireProjectAuthSession(request, reply, projectId);
    if (!session) {
      return;
    }

    await revokeAuthSession(session.sessionId);
    reply.send({ ok: true });
  });

  app.post('/runtime/auth/token/refresh', async (request, reply) => {
    const body = request.body as
      | {
          projectId?: string;
          refreshToken?: string;
        }
      | undefined;
    const projectId = body?.projectId?.trim();
    const refreshToken = body?.refreshToken?.trim();
    if (!projectId || !refreshToken) {
      reply.code(400).send({ error: 'projectId and refreshToken are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const config = await ensureAuthProjectConfig(projectId);
    const rotated = await rotateAuthRefreshToken({
      projectId,
      refreshToken,
      accessTokenTtlMinutes: config.accessTokenTtlMinutes,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
    });
    if (!rotated) {
      reply.code(401).send({ error: 'Invalid refresh token' });
      return;
    }
    const access = await signProjectAccessToken({
      projectId,
      endUserId: rotated.refresh.endUserId,
      sessionId: rotated.refresh.sessionId,
      expiresInMinutes: config.accessTokenTtlMinutes,
    });

    reply.send({
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      sessionToken: rotated.sessionToken,
      refreshToken: rotated.refreshToken,
      sessionExpiresAt: rotated.sessionExpiresAt.toISOString(),
      refreshExpiresAt: rotated.refresh.expiresAt.toISOString(),
    });
  });

  app.post('/runtime/auth/password/forgot', async (request, reply) => {
    const body = request.body as { projectId?: string; email?: string } | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim().toLowerCase();
    if (!projectId || !email) {
      reply.code(400).send({ error: 'projectId and email are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const endUser = await prisma.authEndUser.findFirst({
      where: { projectId, email },
      select: { id: true },
    });
    if (!endUser) {
      reply.send({ ok: true });
      return;
    }

    const issued = await issuePasswordResetToken({
      projectId,
      endUserId: endUser.id,
    });
    const emailMessage = buildPasswordResetEmail({ resetToken: issued.token });
    try {
      await authEmailProvider.send({
        to: email,
        subject: emailMessage.subject,
        text: emailMessage.text,
      });
    } catch (error) {
      app.log.error(
        {
          event: 'auth.email.send_failed',
          provider: authEmailProvider.name,
          flow: 'password_reset',
          projectId,
          email,
          error: error instanceof Error ? error.message : String(error),
        },
        'failed to send password reset email',
      );
    }

    reply.send({ ok: true, resetToken: issued.token });
  });

  app.post('/runtime/auth/password/reset', async (request, reply) => {
    const body = request.body as
      | { projectId?: string; token?: string; password?: string }
      | undefined;
    const projectId = body?.projectId?.trim();
    const token = body?.token?.trim();
    const password = body?.password;
    if (!projectId || !token || !password) {
      reply.code(400).send({ error: 'projectId, token, and password are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const record = await prisma.authPasswordResetToken.findFirst({
      where: {
        projectId,
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, endUserId: true },
    });
    if (!record) {
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }

    await rotateLocalPassword({
      projectId,
      endUserId: record.endUserId,
      nextPassword: password,
    });
    await prisma.authPasswordResetToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    reply.send({ ok: true });
  });

  app.post('/runtime/auth/email/verify/request', async (request, reply) => {
    const body = request.body as { projectId?: string; email?: string } | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim().toLowerCase();
    if (!projectId || !email) {
      reply.code(400).send({ error: 'projectId and email are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const endUser = await prisma.authEndUser.findFirst({
      where: { projectId, email },
      select: { id: true },
    });
    if (!endUser) {
      reply.send({ ok: true });
      return;
    }

    const issued = await issueEmailVerificationToken({
      projectId,
      endUserId: endUser.id,
    });
    const emailMessage = buildEmailVerificationEmail({
      verificationToken: issued.token,
    });
    try {
      await authEmailProvider.send({
        to: email,
        subject: emailMessage.subject,
        text: emailMessage.text,
      });
    } catch (error) {
      app.log.error(
        {
          event: 'auth.email.send_failed',
          provider: authEmailProvider.name,
          flow: 'email_verification',
          projectId,
          email,
          error: error instanceof Error ? error.message : String(error),
        },
        'failed to send email verification email',
      );
    }
    reply.send({ ok: true, verificationToken: issued.token });
  });

  app.post('/runtime/auth/email/verify/confirm', async (request, reply) => {
    const body = request.body as { projectId?: string; token?: string } | undefined;
    const projectId = body?.projectId?.trim();
    const token = body?.token?.trim();
    if (!projectId || !token) {
      reply.code(400).send({ error: 'projectId and token are required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const record = await prisma.authEmailVerificationToken.findFirst({
      where: {
        projectId,
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, endUserId: true },
    });
    if (!record) {
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }

    await prisma.authEmailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    await prisma.authEndUser.update({
      where: { id: record.endUserId },
      data: { emailVerifiedAt: new Date() },
    });

    reply.send({ ok: true });
  });

  app.get('/runtime/auth/jwks', async (request, reply) => {
    const query = request.query as { projectId?: string } | undefined;
    const projectId = query?.projectId?.trim();
    if (!projectId) {
      reply.code(400).send({ error: 'projectId is required' });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const jwks = await buildProjectJwks(projectId);
    reply.send(jwks);
  });
}
