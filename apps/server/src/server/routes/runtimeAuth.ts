import { Prisma, ProjectModuleKey } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  ensureAuthProjectConfig,
  issueAuthSessionWithRefresh,
  revokeAuthSession,
  rotateAuthRefreshToken,
} from '../services/auth/core.js';
import {
  registerLocalIdentity,
  verifyLocalCredentials,
} from '../services/auth/localIdentity.js';
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

      reply.code(201).send({
        endUser: {
          id: endUser.id,
          projectId: endUser.projectId,
          email: endUser.email,
          displayName: endUser.displayName,
        },
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

    reply.send({
      endUser: verified.endUser,
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

    reply.send({
      sessionToken: rotated.sessionToken,
      refreshToken: rotated.refreshToken,
      sessionExpiresAt: rotated.sessionExpiresAt.toISOString(),
      refreshExpiresAt: rotated.refresh.expiresAt.toISOString(),
    });
  });
}
