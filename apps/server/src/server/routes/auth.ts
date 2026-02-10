import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashPassword, hashToken, verifyPassword } from '../../auth.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { toUserDto } from '../mappers/users.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from '../auth/session.js';
import { logAudit } from '../services/audit.js';
import { buildCliLoginUrl } from '../services/format.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = request.body as { email?: string; password?: string; name?: string } | undefined;
      if (!body?.email || !body?.password) {
        reply.code(400).send({ error: 'Email and password are required' });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) {
        reply.code(409).send({ error: 'Email already registered' });
        return;
      }

      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: { email: body.email, passwordHash, name: body.name ?? null },
      });

      const token = generateToken();
      await prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000),
        },
      });

      const csrfToken = generateToken();
      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });

      reply.code(201).send({ user: toUserDto(user) });
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = request.body as { email?: string; password?: string } | undefined;
      if (!body?.email || !body?.password) {
        reply.code(400).send({ error: 'Email and password are required' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user) {
        reply.code(401).send({ error: 'Invalid credentials' });
        return;
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        reply.code(401).send({ error: 'Invalid credentials' });
        return;
      }

      const token = generateToken();
      await prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000),
        },
      });

      const csrfToken = generateToken();
      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });

      reply.send({ user: toUserDto(user) });
    },
  );

  app.post('/auth/cli-login', async (_request, reply) => {
    const code = generateToken();
    const expiresAt = new Date(Date.now() + config.cliLoginTtlMinutes * 60 * 1000);

    await prisma.cliLoginSession.create({
      data: {
        code,
        expiresAt,
      },
    });

    reply.send({
      code,
      loginUrl: buildCliLoginUrl(code),
      expiresAt: expiresAt.toISOString(),
    });
  });

  app.post('/auth/cli-login/issue', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    if (auth.viaToken) {
      reply.code(403).send({ error: 'Token sessions cannot issue CLI logins' });
      return;
    }

    const body = request.body as
      | { code?: string; projectId?: string; name?: string; mode?: 'global' | 'project' }
      | undefined;
    const code = body?.code?.trim();
    const mode = body?.mode === 'project' ? 'project' : 'global';
    const projectId = body?.projectId?.trim();
    const name = body?.name?.trim() ?? 'CLI login';

    if (!code) {
      reply.code(400).send({ error: 'Code is required' });
      return;
    }

    if (mode === 'project' && !projectId) {
      reply.code(400).send({ error: 'projectId is required in project mode' });
      return;
    }

    const session = await prisma.cliLoginSession.findUnique({ where: { code } });
    if (!session || session.expiresAt <= new Date()) {
      reply.code(404).send({ error: 'CLI login session not found or expired' });
      return;
    }

    if (session.consumedAt) {
      reply.code(409).send({ error: 'CLI login session already completed' });
      return;
    }

    if (session.token) {
      reply.code(409).send({ error: 'CLI login token already issued' });
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'CLI login requires a user session' });
      return;
    }

    const raw = generateToken();
    if (mode === 'project') {
      const role = await requireProjectRole(request, reply, projectId!, Role.VIEWER);
      if (!role) {
        return;
      }

      const token = await prisma.apiToken.create({
        data: {
          projectId: projectId!,
          name,
          tokenHash: hashToken(raw),
          createdBy: auth.user.id,
          readOnly: false,
          expiresAt: new Date(Date.now() + config.apiTokenTtlDays * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.cliLoginSession.update({
        where: { id: session.id },
        data: {
          token: raw,
          userId: auth.user.id,
          projectId: projectId!,
        },
      });

      await logAudit({
        projectId: projectId!,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'token.create',
        resourceType: 'api_token',
        resourceId: token.id,
        metadataJson: { source: 'cli-login', scopeType: 'project' },
      });

      reply.send({
        token: raw,
        tokenMeta: {
          id: token.id,
          scopeType: 'project',
          projectId: token.projectId,
          name: token.name,
          readOnly: token.readOnly,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          expiresAt: token.expiresAt?.toISOString() ?? null,
        },
      });
      return;
    }

    if (!config.enableGlobalCliTokens) {
      reply.code(403).send({ error: 'Global CLI bootstrap tokens are currently disabled' });
      return;
    }

    const token = await prisma.globalCliToken.create({
      data: {
        name,
        tokenHash: hashToken(raw),
        createdBy: auth.user.id,
        expiresAt: new Date(Date.now() + config.globalCliTokenTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.cliLoginSession.update({
      where: { id: session.id },
      data: {
        token: raw,
        userId: auth.user.id,
        projectId: null,
      },
    });

    app.log.info(
      {
        event: 'global_cli_token.create',
        source: 'cli-login',
        tokenId: token.id,
        actorUserId: auth.user.id,
        scopeType: 'global_bootstrap',
      },
      'global bootstrap token created',
    );

    reply.send({
      token: raw,
      tokenMeta: {
        id: token.id,
        scopeType: 'global_bootstrap',
        name: token.name,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      },
    });
  });

  app.post('/auth/cli-login/complete', async (request, reply) => {
    const body = request.body as { code?: string } | undefined;
    const code = body?.code?.trim();
    if (!code) {
      reply.code(400).send({ error: 'Code is required' });
      return;
    }

    const session = await prisma.cliLoginSession.findUnique({ where: { code } });
    if (!session || session.expiresAt <= new Date()) {
      reply.code(404).send({ error: 'CLI login session not found or expired' });
      return;
    }

    if (!session.token) {
      reply.send({ status: 'pending' });
      return;
    }

    const token = session.token;
    await prisma.cliLoginSession.update({
      where: { id: session.id },
      data: {
        token: null,
        consumedAt: new Date(),
      },
    });

    reply.send({
      status: 'complete',
      token,
      ...(session.projectId ? { projectId: session.projectId } : {}),
    });
  });

  app.get('/auth/csrf', async (request, reply) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const csrfToken = request.cookies[CSRF_COOKIE_NAME] ?? generateToken();
    if (!request.cookies[CSRF_COOKIE_NAME]) {
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
    }

    reply.send({ csrfToken });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await prisma.userSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      });
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    reply.send({ ok: true });
  });

  app.get('/me', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    reply.send({ user: auth.user });
  });

  app.patch('/me', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    if (auth.viaToken) {
      reply.code(403).send({ error: 'Token sessions cannot update profile' });
      return;
    }

    const body = request.body as
      | {
          name?: string;
          email?: string;
          currentPassword?: string;
          newPassword?: string;
        }
      | undefined;

    const name = body?.name?.trim();
    const newPassword = body?.newPassword?.trim();
    const currentPassword = body?.currentPassword;

    const wantsName = typeof body?.name !== 'undefined';
    const wantsPassword = typeof body?.newPassword !== 'undefined';

    if (typeof body?.email !== 'undefined') {
      reply.code(400).send({ error: 'Email updates are not supported' });
      return;
    }

    if (!wantsName && !wantsPassword) {
      reply.code(400).send({ error: 'No changes provided' });
      return;
    }

    if (wantsName && !name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }

    if (wantsPassword && !newPassword) {
      reply.code(400).send({ error: 'New password is required' });
      return;
    }

    if (wantsPassword && !currentPassword) {
      reply.code(400).send({ error: 'Current password is required' });
      return;
    }

    if (wantsPassword) {
      const userRecord = await prisma.user.findUnique({
        where: { id: auth.user!.id },
      });
      if (!userRecord) {
        reply.code(404).send({ error: 'User not found' });
        return;
      }
      const valid = await verifyPassword(currentPassword ?? '', userRecord.passwordHash);
      if (!valid) {
        reply.code(401).send({ error: 'Invalid credentials' });
        return;
      }
    }

    const data: { name?: string; passwordHash?: string } = {};
    if (wantsName && name) {
      data.name = name;
    }
    if (wantsPassword && newPassword) {
      data.passwordHash = await hashPassword(newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: auth.user!.id },
      data,
    });

    reply.send({ user: toUserDto(updated) });
  });
}
