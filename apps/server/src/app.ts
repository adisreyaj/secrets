import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Prisma, Role } from '@prisma/client';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { generateToken, hashPassword, hashToken, verifyPassword } from './auth.js';
import { config } from './config.js';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from './crypto.js';
import { prisma } from './db.js';
import './types.js';
import type { AuthContext } from './types.js';

const SESSION_COOKIE_NAME = 'sm_session';
const CSRF_COOKIE_NAME = 'sm_csrf';

const ROLE_RANK: Record<Role, number> = {
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

function isRole(value: string): value is Role {
  return value === 'ADMIN' || value === 'EDITOR' || value === 'VIEWER';
}

function slugify(value: string, fallback: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base.length > 0 ? base : fallback;
}

async function ensureUniqueProjectSlug(base: string): Promise<string> {
  const normalized = slugify(base, 'project').slice(0, 48);
  let candidate = normalized;
  let suffix = 1;
  while (true) {
    const existing = await prisma.project.findUnique({ where: { slug: candidate } });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalized}-${suffix}`.slice(0, 64);
  }
}

async function ensureUniqueEnvironmentSlug(projectId: string, base: string): Promise<string> {
  const normalized = slugify(base, 'env').slice(0, 48);
  let candidate = normalized;
  let suffix = 1;
  while (true) {
    const existing = await prisma.environment.findFirst({
      where: { projectId, slug: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalized}-${suffix}`.slice(0, 64);
  }
}

function toUserDto(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}

function toProjectDto(
  project: { id: string; name: string; slug: string | null; createdAt: Date; updatedAt: Date },
  role?: Role,
) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    role,
  };
}

function toEnvironmentDto(env: {
  id: string;
  projectId: string;
  name: string;
  slug: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    slug: env.slug,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
  };
}

function toInviteDto(invite: {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
}) {
  return {
    id: invite.id,
    projectId: invite.projectId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
  };
}

function formatDotenvValue(value: string): string {
  if (/\s|#|"|\\|\n/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function buildCliLoginUrl(code: string): string {
  const base = config.appOrigin.replace(/\/$/, '');
  return `${base}/#/cli-login?code=${encodeURIComponent(code)}`;
}

async function logAudit(params: {
  projectId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  await prisma.auditLog.create({
    data: {
      projectId: params.projectId,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadataJson: (params.metadataJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

async function getProjectRole(request: FastifyRequest, projectId: string): Promise<Role | null> {
  if (!request.auth?.user) {
    return null;
  }

  if (request.auth.viaToken) {
    if (request.auth.projectId !== projectId) {
      return null;
    }
    return request.auth.role ?? null;
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: request.auth.user.id,
      },
    },
  });

  return membership?.role ?? null;
}

async function requireProjectRole(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  minRole: Role,
): Promise<Role | null> {
  const role = await getProjectRole(request, projectId);
  if (!role) {
    reply.code(403).send({ error: 'Forbidden' });
    return null;
  }

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    reply.code(403).send({ error: 'Insufficient role' });
    return null;
  }

  return role;
}

function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthContext | null {
  if (!request.auth?.user) {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }

  return request.auth;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const masterKey = loadMasterKey();

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cors, {
    origin: config.appOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });

  app.addHook('preHandler', async (request) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);
      const session = await prisma.userSession.findFirst({
        where: {
          tokenHash,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (session) {
        request.auth = {
          user: toUserDto(session.user),
          viaToken: false,
        };
        return;
      }
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice('Bearer '.length).trim();
      if (raw) {
        const tokenHash = hashToken(raw);
        const token = await prisma.apiToken.findFirst({
          where: {
            tokenHash,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { creator: true },
        });
        if (token) {
          const membership = await prisma.projectMember.findUnique({
            where: {
              projectId_userId: {
                projectId: token.projectId,
                userId: token.createdBy,
              },
            },
          });

          request.auth = {
            user: toUserDto(token.creator),
            viaToken: true,
            projectId: token.projectId,
            role: membership?.role ?? null,
            readOnly: token.readOnly,
          };

          await prisma.apiToken.update({
            where: { id: token.id },
            data: { lastUsedAt: new Date() },
          });
        }
      }
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && !request.cookies[CSRF_COOKIE_NAME]) {
      const csrfToken = generateToken();
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
    }

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return;
    }

    const routePath =
      (request.routeOptions && request.routeOptions.url) ||
      (request as { routerPath?: string }).routerPath ||
      request.url.split('?')[0];
    if (routePath === '/auth/cli-login' || routePath === '/auth/cli-login/complete') {
      return;
    }

    if (request.auth?.viaToken && request.auth.readOnly) {
      return reply.code(403).send({ error: 'Read-only token cannot perform write actions' });
    }

    if (request.auth?.viaToken) {
      return;
    }

    if (sessionToken) {
      const csrfCookie = request.cookies[CSRF_COOKIE_NAME];
      const csrfHeader = request.headers['x-csrf-token'];
      if (!csrfCookie || !csrfHeader || csrfHeader !== csrfCookie) {
        return reply.code(403).send({ error: 'Invalid CSRF token' });
      }
    }

    const origin = request.headers.origin;
    if (!origin || origin !== config.appOrigin) {
      return reply.code(403).send({ error: 'Invalid origin' });
    }
  });

  app.get('/health', async () => ({ ok: true }));

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

    const body = request.body as { code?: string; projectId?: string; name?: string } | undefined;
    const code = body?.code?.trim();
    const projectId = body?.projectId?.trim();
    const name = body?.name?.trim() ?? 'CLI login';

    if (!code || !projectId) {
      reply.code(400).send({ error: 'Code and projectId are required' });
      return;
    }

    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
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

    const raw = generateToken();
    const token = await prisma.apiToken.create({
      data: {
        projectId,
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
        projectId,
      },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'token.create',
      resourceType: 'api_token',
      resourceId: token.id,
      metadataJson: { source: 'cli-login' },
    });

    reply.send({
      token: raw,
      tokenMeta: {
        id: token.id,
        projectId: token.projectId,
        name: token.name,
        readOnly: token.readOnly,
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
      projectId: session.projectId,
    });
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
        where: { id: auth.user.id },
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
      where: { id: auth.user.id },
      data,
    });

    reply.send({ user: toUserDto(updated) });
  });

  app.post('/projects', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const body = request.body as { name?: string } | undefined;
    if (!body?.name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }

    const slug = await ensureUniqueProjectSlug(body.name);
    const project = await prisma.project.create({
      data: {
        name: body.name,
        slug,
        members: {
          create: {
            userId: auth.user.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    await logAudit({
      projectId: project.id,
      actorUserId: auth.user.id,
      action: 'project.create',
      resourceType: 'project',
      resourceId: project.id,
    });

    reply.code(201).send(toProjectDto(project, Role.ADMIN));
  });

  app.get('/projects', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const memberships = await prisma.projectMember.findMany({
      where: { userId: auth.user.id },
      include: { project: true },
    });

    reply.send(memberships.map((membership) => toProjectDto(membership.project, membership.role)));
  });

  app.get('/projects/slug/:slug', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { slug } = request.params as { slug: string };
    const project = await prisma.project.findUnique({ where: { slug } });
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, project.id, Role.VIEWER);
    if (!role) {
      return;
    }

    reply.send(toProjectDto(project, role));
  });

  app.post('/projects/:id/members', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { email?: string; role?: string } | undefined;
    if (!body?.email || !body?.role || !isRole(body.role)) {
      reply.code(400).send({ error: 'Email and role are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      reply.code(404).send({ error: 'User not found' });
      return;
    }

    const membership = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, role: body.role },
      update: { role: body.role },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'project.member.add',
      resourceType: 'project_member',
      resourceId: membership.id,
      metadataJson: { memberUserId: user.id, role: body.role },
    });

    reply.code(201).send({ id: membership.id, userId: membership.userId, role: membership.role });
  });

  app.get('/projects/:id/members', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true },
    });

    reply.send(
      members.map((member) => ({
        id: member.id,
        projectId: member.projectId,
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role,
      })),
    );
  });

  app.post('/projects/:id/invites', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { email?: string; role?: string } | undefined;
    if (!body?.email || !body?.role || !isRole(body.role)) {
      reply.code(400).send({ error: 'Email and role are required' });
      return;
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    const existingMember = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { projectId },
          select: { id: true },
        },
      },
    });
    if (existingMember?.memberships.length) {
      reply.code(409).send({ error: 'User is already a project member' });
      return;
    }

    const existingInvite = await prisma.projectInvite.findFirst({
      where: {
        projectId,
        email: normalizedEmail,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) {
      reply.code(409).send({ error: 'Active invite already exists for this email' });
      return;
    }

    const token = generateToken();
    const invite = await prisma.projectInvite.create({
      data: {
        projectId,
        email: normalizedEmail,
        role: body.role,
        status: 'PENDING',
        tokenHash: hashToken(token),
        createdBy: auth.user.id,
        expiresAt: new Date(Date.now() + config.inviteTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'invite.create',
      resourceType: 'project_invite',
      resourceId: invite.id,
      metadataJson: { email: normalizedEmail, role: body.role },
    });

    reply.code(201).send({
      invite: toInviteDto(invite),
      token,
    });
  });

  app.get('/projects/:id/invites', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const invites = await prisma.projectInvite.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(invites.map(toInviteDto));
  });

  app.delete('/projects/:id/invites/:inviteId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, inviteId } = request.params as { id: string; inviteId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const invite = await prisma.projectInvite.findFirst({
      where: { id: inviteId, projectId },
    });
    if (!invite) {
      reply.code(404).send({ error: 'Invite not found' });
      return;
    }

    await prisma.projectInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'invite.revoke',
      resourceType: 'project_invite',
      resourceId: inviteId,
    });

    reply.send({ ok: true });
  });

  app.post('/invites/accept', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const body = request.body as { token?: string } | undefined;
    const token = body?.token?.trim();
    if (!token) {
      reply.code(400).send({ error: 'Token is required' });
      return;
    }

    const invite = await prisma.projectInvite.findFirst({
      where: {
        tokenHash: hashToken(token),
        status: 'PENDING',
      },
    });
    if (!invite) {
      reply.code(404).send({ error: 'Invite not found or already used' });
      return;
    }

    if (invite.expiresAt <= new Date()) {
      await prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      reply.code(410).send({ error: 'Invite has expired' });
      return;
    }

    if (auth.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      reply.code(403).send({ error: 'Invite email does not match your account' });
      return;
    }

    await prisma.$transaction([
      prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: invite.projectId,
            userId: auth.user.id,
          },
        },
        create: {
          projectId: invite.projectId,
          userId: auth.user.id,
          role: invite.role,
        },
        update: {
          role: invite.role,
        },
      }),
      prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      }),
    ]);

    await logAudit({
      projectId: invite.projectId,
      actorUserId: auth.user.id,
      action: 'invite.accept',
      resourceType: 'project_invite',
      resourceId: invite.id,
    });

    reply.send({ ok: true, projectId: invite.projectId });
  });

  app.post('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const body = request.body as { name?: string; copyFromEnvironmentId?: string | null } | undefined;
    if (!body?.name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }

    const copyFromId = body.copyFromEnvironmentId?.trim();
    let sourceEnv: { id: string; projectId: string } | null = null;
    if (copyFromId) {
      sourceEnv = await prisma.environment.findFirst({
        where: { id: copyFromId, projectId },
        select: { id: true, projectId: true },
      });
      if (!sourceEnv) {
        reply.code(400).send({ error: 'Source environment not found' });
        return;
      }
    }

    const slug = await ensureUniqueEnvironmentSlug(projectId, body.name);
    const env = await prisma.environment.create({
      data: {
        projectId,
        name: body.name,
        slug,
      },
    });

    let copiedCount = 0;
    if (sourceEnv) {
      const secrets = await prisma.secret.findMany({
        where: { environmentId: sourceEnv.id, deletedAt: null },
        include: {
          versions: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { key: 'asc' },
      });

      if (secrets.length > 0) {
        const operations: Prisma.PrismaPromise<unknown>[] = [];
        for (const secret of secrets) {
          const version = secret.versions[0];
          if (!version) {
            operations.push(
              prisma.secret.create({
                data: {
                  environmentId: env.id,
                  key: secret.key,
                },
              }),
            );
            continue;
          }

          const value = decryptSecret(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            masterKey,
          );
          const payload = encryptSecret(value, masterKey);
          const keyVersion = masterKeyVersion();

          operations.push(
            prisma.secret.create({
              data: {
                environmentId: env.id,
                key: secret.key,
                versions: {
                  create: {
                    ciphertext: payload.ciphertext,
                    iv: payload.iv,
                    tag: payload.tag,
                    keyVersion,
                    createdBy: auth.user.id,
                    isActive: true,
                  },
                },
              },
            }),
          );
        }

        await prisma.$transaction(operations);
        copiedCount = secrets.length;
      }
    }

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'environment.create',
      resourceType: 'environment',
      resourceId: env.id,
      metadataJson: sourceEnv
        ? { copyFromEnvironmentId: sourceEnv.id, copiedSecrets: copiedCount }
        : null,
    });

    reply.code(201).send(toEnvironmentDto(env));
  });

  app.get('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const envs = await prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(envs.map(toEnvironmentDto));
  });

  app.get('/projects/:id/environments/slug/:slug', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, slug } = request.params as { id: string; slug: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const env = await prisma.environment.findFirst({
      where: { projectId, slug },
    });

    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    reply.send(toEnvironmentDto(env));
  });

  app.get('/environments/:id/secrets', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const includeValues =
      request.query && (request.query as { includeValues?: string }).includeValues === 'true';

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const secrets = await prisma.secret.findMany({
      where: { environmentId: envId, deletedAt: null },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    const canViewValues = includeValues && ROLE_RANK[role] >= ROLE_RANK.EDITOR;

    const data = secrets.map((secret) => {
      const version = secret.versions[0];
      let value: string | undefined;
      if (canViewValues && version) {
        value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
      }

      return {
        id: secret.id,
        environmentId: secret.environmentId,
        key: secret.key,
        updatedAt: secret.updatedAt.toISOString(),
        versionId: version?.id,
        value,
      };
    });

    reply.send(data);
  });

  app.post('/environments/:id/secrets', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string } | undefined;
    if (!body?.key || body.value === undefined) {
      reply.code(400).send({ error: 'Key and value are required' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const payload = encryptSecret(body.value, masterKey);
    const keyVersion = masterKeyVersion();

    const existing = await prisma.secret.findUnique({
      where: { environmentId_key: { environmentId: envId, key: body.key } },
    });

    let secretId = existing?.id;
    if (!secretId) {
      const secret = await prisma.secret.create({
        data: {
          environmentId: envId,
          key: body.key,
        },
      });
      secretId = secret.id;
    }

    await prisma.$transaction([
      prisma.secretVersion.updateMany({
        where: { secretId },
        data: { isActive: false },
      }),
      prisma.secretVersion.create({
        data: {
          secretId,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          tag: payload.tag,
          keyVersion,
          createdBy: auth.user.id,
          isActive: true,
        },
      }),
      prisma.secret.update({
        where: { id: secretId },
        data: { updatedAt: new Date(), deletedAt: null },
      }),
    ]);

    await logAudit({
      projectId: env.projectId,
      actorUserId: auth.user.id,
      action: 'secret.create',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: { key: body.key, environmentId: envId },
    });

    reply.code(201).send({ id: secretId });
  });

  app.patch('/secrets/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string } | undefined;
    const nextKeyRaw = typeof body?.key === 'string' ? body?.key : undefined;
    const nextValueRaw = typeof body?.value === 'string' ? body?.value : undefined;
    const nextKey = nextKeyRaw?.trim();
    const nextValue = nextValueRaw?.trim();
    if (nextKeyRaw === undefined && nextValueRaw === undefined) {
      reply.code(400).send({ error: 'Key or value is required' });
      return;
    }
    if (nextKeyRaw !== undefined && !nextKey) {
      reply.code(400).send({ error: 'Key is required' });
      return;
    }
    if (nextValueRaw !== undefined && !nextValue) {
      reply.code(400).send({ error: 'Value is required' });
      return;
    }

    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const keyChanged = nextKey && nextKey !== secret.key;
    if (keyChanged) {
      const existing = await prisma.secret.findUnique({
        where: {
          environmentId_key: { environmentId: secret.environmentId, key: nextKey },
        },
      });
      if (existing && existing.id !== secretId) {
        reply.code(409).send({ error: 'Key already exists in this environment' });
        return;
      }
    }

    const updateData: { key?: string; updatedAt: Date; deletedAt: null } = {
      updatedAt: new Date(),
      deletedAt: null,
    };
    if (keyChanged && nextKey) {
      updateData.key = nextKey;
    }

    const transactionOps = [];
    const valueChanged = nextValueRaw !== undefined;
    if (valueChanged && nextValue) {
      const payload = encryptSecret(nextValue, masterKey);
      const keyVersion = masterKeyVersion();
      transactionOps.push(
        prisma.secretVersion.updateMany({
          where: { secretId },
          data: { isActive: false },
        }),
        prisma.secretVersion.create({
          data: {
            secretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user.id,
            isActive: true,
          },
        }),
      );
    }
    transactionOps.push(
      prisma.secret.update({
        where: { id: secretId },
        data: updateData,
      }),
    );

    await prisma.$transaction(transactionOps);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user.id,
      action: 'secret.update',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: {
        previousKey: secret.key,
        updatedKey: keyChanged ? nextKey : secret.key,
        updatedValue: valueChanged,
      },
    });

    reply.send({ ok: true });
  });

  app.post('/secrets/:id/copy', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as
      | { targetEnvironmentIds?: string[]; overwrite?: boolean }
      | undefined;
    const rawTargets = body?.targetEnvironmentIds?.filter((id) => id.trim().length > 0) ?? [];
    const targetIds = Array.from(new Set(rawTargets));
    if (targetIds.length === 0) {
      reply.code(400).send({ error: 'Target environments are required' });
      return;
    }

    const secret = await prisma.secret.findUnique({
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const activeVersion = secret.versions[0];
    if (!activeVersion) {
      reply.code(400).send({ error: 'Secret has no active version' });
      return;
    }

    const targetIdsWithoutSource = targetIds.filter((id) => id !== secret.environmentId);
    if (targetIdsWithoutSource.length === 0) {
      reply.code(400).send({ error: 'No target environments provided' });
      return;
    }

    const targetEnvs = await prisma.environment.findMany({
      where: { id: { in: targetIdsWithoutSource } },
    });
    if (targetEnvs.length !== targetIdsWithoutSource.length) {
      reply.code(404).send({ error: 'One or more environments not found' });
      return;
    }

    if (targetEnvs.some((env) => env.projectId !== secret.environment.projectId)) {
      reply.code(400).send({ error: 'Targets must belong to the same project' });
      return;
    }

    const value = decryptSecret(
      { ciphertext: activeVersion.ciphertext, iv: activeVersion.iv, tag: activeVersion.tag },
      masterKey,
    );
    const keyVersion = masterKeyVersion();
    const overwrite = body?.overwrite === true;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const env of targetEnvs) {
        const existing = await tx.secret.findUnique({
          where: { environmentId_key: { environmentId: env.id, key: secret.key } },
        });

        if (existing && !overwrite) {
          skipped.push(env.id);
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const createdSecret = await tx.secret.create({
            data: { environmentId: env.id, key: secret.key },
          });
          targetSecretId = createdSecret.id;
          created.push(env.id);
        } else {
          updated.push(env.id);
        }

        const payload = encryptSecret(value, masterKey);

        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
      }
    });

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user.id,
      action: 'secret.copy',
      resourceType: 'secret',
      resourceId: secret.id,
      metadataJson: {
        key: secret.key,
        sourceEnvironmentId: secret.environmentId,
        targetEnvironmentIds: targetIdsWithoutSource,
        overwrite,
        created,
        updated,
        skipped,
      },
    });

    reply.send({ created, updated, skipped });
  });

  app.post('/environments/:id/secrets/copy-from', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: targetEnvId } = request.params as { id: string };
    const body = request.body as
      | { sourceEnvironmentId?: string; keys?: string[]; overwrite?: boolean }
      | undefined;

    const sourceEnvironmentId = body?.sourceEnvironmentId?.trim();
    if (!sourceEnvironmentId) {
      reply.code(400).send({ error: 'Source environment is required' });
      return;
    }

    const targetEnv = await prisma.environment.findUnique({ where: { id: targetEnvId } });
    if (!targetEnv) {
      reply.code(404).send({ error: 'Target environment not found' });
      return;
    }

    const sourceEnv = await prisma.environment.findUnique({ where: { id: sourceEnvironmentId } });
    if (!sourceEnv) {
      reply.code(404).send({ error: 'Source environment not found' });
      return;
    }

    if (sourceEnv.projectId !== targetEnv.projectId) {
      reply.code(400).send({ error: 'Source and target must belong to the same project' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      targetEnv.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const overwrite = body?.overwrite === true;
    const keys = body?.keys?.filter((key) => key.trim().length > 0);

    const sourceSecrets = await prisma.secret.findMany({
      where: {
        environmentId: sourceEnv.id,
        deletedAt: null,
        ...(keys?.length ? { key: { in: keys } } : {}),
      },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    if (sourceSecrets.length === 0) {
      reply.send({ created: [], updated: [], skipped: [] });
      return;
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const keyVersion = masterKeyVersion();

    await prisma.$transaction(async (tx) => {
      for (const sourceSecret of sourceSecrets) {
        const version = sourceSecret.versions[0];
        if (!version) {
          continue;
        }

        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: { environmentId: targetEnv.id, key: sourceSecret.key },
          },
        });

        if (existing && !overwrite) {
          skipped.push(sourceSecret.key);
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const createdSecret = await tx.secret.create({
            data: { environmentId: targetEnv.id, key: sourceSecret.key },
          });
          targetSecretId = createdSecret.id;
          created.push(sourceSecret.key);
        } else {
          updated.push(sourceSecret.key);
        }

        const value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
        const payload = encryptSecret(value, masterKey);

        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
      }
    });

    await logAudit({
      projectId: targetEnv.projectId,
      actorUserId: auth.user.id,
      action: 'secret.copy.bulk',
      resourceType: 'secret',
      metadataJson: {
        sourceEnvironmentId: sourceEnv.id,
        targetEnvironmentId: targetEnv.id,
        overwrite,
        created,
        updated,
        skipped,
      },
    });

    reply.send({ created, updated, skipped });
  });

  app.post('/secrets/:id/rollback', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as { versionId?: string } | undefined;

    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const versions = await prisma.secretVersion.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
    });

    if (versions.length < 2 && !body?.versionId) {
      reply.code(400).send({ error: 'No previous version to rollback' });
      return;
    }

    const target = body?.versionId ? versions.find((v) => v.id === body.versionId) : versions[1];

    if (!target) {
      reply.code(404).send({ error: 'Version not found' });
      return;
    }

    await prisma.$transaction([
      prisma.secretVersion.updateMany({ where: { secretId }, data: { isActive: false } }),
      prisma.secretVersion.update({ where: { id: target.id }, data: { isActive: true } }),
    ]);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user.id,
      action: 'secret.rollback',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: { versionId: target.id },
    });

    reply.send({ ok: true });
  });

  app.get('/secrets/:id/diff', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const versions = await prisma.secretVersion.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    if (versions.length < 2) {
      reply.code(400).send({ error: 'Not enough versions to diff' });
      return;
    }

    const [current, previous] = versions;
    const currentValue = decryptSecret(
      { ciphertext: current.ciphertext, iv: current.iv, tag: current.tag },
      masterKey,
    );
    const previousValue = decryptSecret(
      { ciphertext: previous.ciphertext, iv: previous.iv, tag: previous.tag },
      masterKey,
    );

    reply.send({
      secretId,
      key: secret.key,
      current: {
        versionId: current.id,
        value: currentValue,
        createdAt: current.createdAt.toISOString(),
      },
      previous: {
        versionId: previous.id,
        value: previousValue,
        createdAt: previous.createdAt.toISOString(),
      },
    });
  });

  app.delete('/secrets/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    await prisma.secret.update({
      where: { id: secretId },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user.id,
      action: 'secret.delete',
      resourceType: 'secret',
      resourceId: secretId,
    });

    reply.send({ ok: true });
  });

  app.get('/environments/:id/export', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const format = request.query && (request.query as { format?: string }).format;
    if (format && format !== 'dotenv') {
      reply.code(400).send({ error: 'Unsupported format' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const secrets = await prisma.secret.findMany({
      where: { environmentId: envId, deletedAt: null },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    const lines: string[] = [];
    for (const secret of secrets) {
      const version = secret.versions[0];
      if (!version) {
        continue;
      }
      const value = decryptSecret(
        { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
        masterKey,
      );
      lines.push(`${secret.key}=${formatDotenvValue(value)}`);
    }

    const output = `${lines.join('\n')}\n`;
    reply.type('text/plain').send(output);
  });

  app.post('/projects/:id/api-tokens', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { name?: string; readOnly?: boolean } | undefined;
    if (!body?.name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }

    const raw = generateToken();
    const expiresAt =
      config.apiTokenTtlDays > 0
        ? new Date(Date.now() + config.apiTokenTtlDays * 24 * 60 * 60 * 1000)
        : null;
    const token = await prisma.apiToken.create({
      data: {
        projectId,
        name: body.name,
        tokenHash: hashToken(raw),
        createdBy: auth.user.id,
        readOnly: body.readOnly === true,
        expiresAt,
      },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'token.create',
      resourceType: 'api_token',
      resourceId: token.id,
    });

    reply.code(201).send({
      token: raw,
      tokenMeta: {
        id: token.id,
        projectId: token.projectId,
        name: token.name,
        readOnly: token.readOnly,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      },
    });
  });

  app.get('/projects/:id/api-tokens', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const tokens = await prisma.apiToken.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(
      tokens.map((token) => ({
        id: token.id,
        projectId: token.projectId,
        name: token.name,
        readOnly: token.readOnly,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      })),
    );
  });

  app.delete('/projects/:id/api-tokens/:tokenId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, tokenId } = request.params as { id: string; tokenId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const token = await prisma.apiToken.findFirst({
      where: { id: tokenId, projectId },
    });

    if (!token) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }

    await prisma.apiToken.delete({ where: { id: token.id } });

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      action: 'token.delete',
      resourceType: 'api_token',
      resourceId: token.id,
    });

    reply.code(204).send();
  });

  app.get('/audit', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const projectId = (request.query as { projectId?: string } | undefined)?.projectId;
    if (!projectId) {
      reply.code(400).send({ error: 'projectId is required' });
      return;
    }

    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const logs = await prisma.auditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    reply.send(
      logs.map((log) => ({
        id: log.id,
        projectId: log.projectId,
        actorUserId: log.actorUserId,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        metadataJson: (log.metadataJson as Record<string, unknown> | null) ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
    );
  });

  return app;
}
