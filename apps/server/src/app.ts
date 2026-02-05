import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ApprovalAction, ApprovalStatus, Prisma, Role } from '@prisma/client';
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
  project: {
    id: string;
    name: string;
    slug: string | null;
    auditRetentionDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  role?: Role,
) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    auditRetentionDays: project.auditRetentionDays,
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

function toApprovalRuleDto(rule: {
  id: string;
  projectId: string;
  name: string;
  environmentId: string | null;
  keyPattern: string;
  actionsJson: Prisma.JsonValue;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const actions = Array.isArray(rule.actionsJson) ? rule.actionsJson : [];
  return {
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    environmentId: rule.environmentId,
    keyPattern: rule.keyPattern,
    actions,
    isActive: rule.isActive,
    createdBy: rule.createdBy,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function toApprovalRequestDto(request: {
  id: string;
  projectId: string;
  environmentId: string;
  secretId: string | null;
  action: ApprovalAction;
  status: ApprovalStatus;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  deniedAt: Date | null;
  canceledAt: Date | null;
  key: string;
  targetEnvironmentId: string | null;
  expectedVersionId: string | null;
  metadataJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  proposedValue?: string | null;
  currentValue?: string | null;
}) {
  return {
    id: request.id,
    projectId: request.projectId,
    environmentId: request.environmentId,
    secretId: request.secretId,
    action: request.action,
    status: request.status,
    requestedBy: request.requestedBy,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt?.toISOString() ?? null,
    deniedAt: request.deniedAt?.toISOString() ?? null,
    canceledAt: request.canceledAt?.toISOString() ?? null,
    key: request.key,
    targetEnvironmentId: request.targetEnvironmentId,
    expectedVersionId: request.expectedVersionId,
    metadataJson: request.metadataJson as Record<string, unknown> | null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    proposedValue: request.proposedValue ?? undefined,
    currentValue: request.currentValue ?? undefined,
  };
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
  return new RegExp(regex, 'i');
}

function actionsMatch(actionsJson: Prisma.JsonValue, action: ApprovalAction): boolean {
  if (!Array.isArray(actionsJson)) return false;
  return actionsJson.includes(action);
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
  return `${base}/cli-login?code=${encodeURIComponent(code)}`;
}

function parseHeaderValue(header?: string | string[]): string | null {
  if (!header) return null;
  return Array.isArray(header) ? header[0] ?? null : header;
}

function toOrigin(value: string): string | null {
  try {
    return new URL(value).origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getRequestOrigin(request: FastifyRequest): string | null {
  const originHeader = parseHeaderValue(request.headers.origin);
  if (originHeader) {
    const origin = toOrigin(originHeader);
    if (origin) return origin;
  }

  const refererHeader = parseHeaderValue(request.headers.referer);
  if (refererHeader) {
    const refererOrigin = toOrigin(refererHeader);
    if (refererOrigin) return refererOrigin;
  }

  return null;
}

function parseDateInput(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function logAudit(params: {
  projectId: string;
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  await prisma.auditLog.create({
    data: {
      projectId: params.projectId,
      actorUserId: params.actorUserId ?? null,
      actorServiceAccountId: params.actorServiceAccountId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadataJson: (params.metadataJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

async function getProjectRole(request: FastifyRequest, projectId: string): Promise<Role | null> {
  if (request.auth?.viaToken) {
    if (request.auth.projectId !== projectId) {
      return null;
    }
    return request.auth.role ?? null;
  }

  if (!request.auth?.user) {
    return null;
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: request.auth.user!.id,
      },
    },
  });

  return membership?.role ?? null;
}

function requireEnvironmentScope(
  request: FastifyRequest,
  reply: FastifyReply,
  environmentId: string,
): boolean {
  const scope = request.auth?.scopeEnvironmentIds;
  if (request.auth?.viaToken && scope && !scope.includes(environmentId)) {
    reply.code(403).send({ error: 'Token does not have access to this environment' });
    return false;
  }
  return true;
}

function requireUserForApproval(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.auth?.serviceAccountId && !request.auth.user) {
    reply.code(403).send({ error: 'Approvals require a user session' });
    return false;
  }
  return true;
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

async function findMatchingApprovalRules(params: {
  projectId: string;
  environmentId: string;
  action: ApprovalAction;
  key: string;
}) {
  const rules = await prisma.approvalRule.findMany({
    where: {
      projectId: params.projectId,
      isActive: true,
      OR: [{ environmentId: null }, { environmentId: params.environmentId }],
    },
  });

  return rules.filter((rule) => {
    if (!actionsMatch(rule.actionsJson, params.action)) return false;
    const matcher = globToRegExp(rule.keyPattern);
    return matcher.test(params.key);
  });
}

async function findPendingApprovalRequest(params: {
  projectId: string;
  environmentId: string;
  action: ApprovalAction;
  key: string;
  secretId?: string | null;
  targetEnvironmentId?: string | null;
}) {
  return prisma.approvalRequest.findFirst({
    where: {
      projectId: params.projectId,
      environmentId: params.environmentId,
      action: params.action,
      key: params.key,
      secretId: params.secretId ?? null,
      targetEnvironmentId: params.targetEnvironmentId ?? null,
      status: ApprovalStatus.PENDING,
    },
  });
}

async function createApprovalRequest(params: {
  projectId: string;
  environmentId: string;
  action: ApprovalAction;
  key: string;
  requestedBy: string;
  secretId?: string | null;
  targetEnvironmentId?: string | null;
  expectedVersionId?: string | null;
  payload?: { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; tag: Uint8Array<ArrayBuffer>; keyVersion: string } | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  return prisma.approvalRequest.create({
    data: {
      projectId: params.projectId,
      environmentId: params.environmentId,
      secretId: params.secretId ?? null,
      action: params.action,
      status: ApprovalStatus.PENDING,
      requestedBy: params.requestedBy,
      key: params.key,
      targetEnvironmentId: params.targetEnvironmentId ?? null,
      expectedVersionId: params.expectedVersionId ?? null,
      payloadCiphertext: params.payload?.ciphertext,
      payloadIv: params.payload?.iv,
      payloadTag: params.payload?.tag,
      payloadKeyVersion: params.payload?.keyVersion,
      metadataJson: (params.metadataJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthContext | null {
  if (!request.auth?.user && !request.auth?.serviceAccountId) {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }

  return request.auth;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { singleLine: true },
      },
    },
    disableRequestLogging: true,
  });
  const masterKey = loadMasterKey();

  const buildErrorContext = (request: FastifyRequest, statusCode: number) => {
    const route =
      request.routeOptions?.url ?? (request as { routerPath?: string }).routerPath ?? 'unknown';
    return {
      requestId: request.id,
      method: request.method,
      url: request.url,
      route,
      statusCode,
      ip: request.ip,
      auth: request.auth
        ? {
            userId: request.auth.user?.id ?? null,
            serviceAccountId: request.auth.serviceAccountId ?? null,
            projectId: request.auth.projectId ?? null,
            viaToken: request.auth.viaToken,
          }
        : null,
    };
  };

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
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.appOrigins.includes(origin.replace(/\/$/, '')));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

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
          return;
        }

        const serviceToken = await prisma.serviceAccountToken.findFirst({
          where: {
            tokenHash,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            serviceAccount: true,
            environments: true,
          },
        });

        if (serviceToken) {
          const scopeEnvironmentIds = serviceToken.environments.map(
            (scope) => scope.environmentId,
          );
          request.auth = {
            viaToken: true,
            projectId: serviceToken.serviceAccount.projectId,
            role: Role.EDITOR,
            readOnly: serviceToken.readOnly,
            serviceAccountId: serviceToken.serviceAccountId,
            scopeEnvironmentIds,
          };

          await prisma.serviceAccountToken.update({
            where: { id: serviceToken.id },
            data: { lastUsedAt: new Date() },
          });
        }
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? reply.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error(
        { err: error, ...buildErrorContext(request, statusCode) },
        'request failed',
      );
      request.errorLogged = true;
    }
    reply.send(error);
  });

  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode >= 500 && !request.errorLogged) {
      app.log.error(buildErrorContext(request, reply.statusCode), 'request failed');
      request.errorLogged = true;
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const setCsrfCookie = () => {
      const csrfToken = generateToken();
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
    };

    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && !request.cookies[CSRF_COOKIE_NAME]) {
      setCsrfCookie();
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

    const origin = getRequestOrigin(request);
    if (!origin || !config.appOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'Invalid origin' });
    }

    if (sessionToken) {
      const csrfCookie = request.cookies[CSRF_COOKIE_NAME];
      const csrfHeader = parseHeaderValue(request.headers['x-csrf-token']);

      // Bootstrap token for existing sessions that are missing the CSRF cookie in prod.
      if (!csrfCookie) {
        setCsrfCookie();
        return;
      }

      if (!csrfCookie || !csrfHeader || csrfHeader !== csrfCookie) {
        return reply.code(403).send({ error: 'Invalid CSRF token' });
      }
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
    if (!auth.user) {
      reply.code(403).send({ error: 'CLI login requires a user session' });
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
    if (!auth.user) {
      reply.code(403).send({ error: 'API token creation requires a user session' });
      return;
    }

    const slug = await ensureUniqueProjectSlug(body.name);
    const project = await prisma.project.create({
      data: {
        name: body.name,
        slug,
        members: {
          create: {
            userId: auth.user!.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    await logAudit({
      projectId: project.id,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
      where: { userId: auth.user!.id },
      include: { project: true },
    });

    reply.send(memberships.map((membership) => toProjectDto(membership.project, membership.role)));
  });

  app.get('/projects/:id/audit-retention', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, auditRetentionDays: true },
    });

    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    reply.send({ projectId: project.id, auditRetentionDays: project.auditRetentionDays });
  });

  app.put('/projects/:id/audit-retention', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { auditRetentionDays?: number | null } | undefined;
    if (!body || !('auditRetentionDays' in body)) {
      reply.code(400).send({ error: 'auditRetentionDays is required' });
      return;
    }

    if (body.auditRetentionDays !== null) {
      const value = Number(body.auditRetentionDays);
      if (!Number.isFinite(value) || value < 1) {
        reply.code(400).send({ error: 'auditRetentionDays must be >= 1 or null' });
        return;
      }
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: { auditRetentionDays: body.auditRetentionDays },
      select: { id: true, auditRetentionDays: true },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'project.audit_retention.update',
      resourceType: 'project',
      resourceId: projectId,
      metadataJson: { auditRetentionDays: body.auditRetentionDays },
    });

    reply.send({ projectId: project.id, auditRetentionDays: project.auditRetentionDays });
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
    if (!auth.user) {
      reply.code(403).send({ error: 'Invites require a user session' });
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
    if (!auth.user) {
      reply.code(403).send({ error: 'Invite acceptance requires a user session' });
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'invite.accept',
      resourceType: 'project_invite',
      resourceId: invite.id,
    });

    const project = await prisma.project.findUnique({
      where: { id: invite.projectId },
      select: { slug: true },
    });
    reply.send({
      ok: true,
      projectId: invite.projectId,
      projectSlug: project?.slug ?? null,
    });
  });

  app.get('/projects/:id/approval-rules', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const rules = await prisma.approvalRule.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(rules.map(toApprovalRuleDto));
  });

  app.post('/projects/:id/approval-rules', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    const body = request.body as
      | {
          name?: string;
          environmentId?: string | null;
          keyPattern?: string;
          actions?: ApprovalAction[];
          isActive?: boolean;
        }
      | undefined;
    if (!body?.name || !body.keyPattern || !Array.isArray(body.actions) || body.actions.length === 0) {
      reply.code(400).send({ error: 'Name, keyPattern, and actions are required' });
      return;
    }
    if (body.environmentId) {
      const env = await prisma.environment.findUnique({ where: { id: body.environmentId } });
      if (!env || env.projectId !== projectId) {
        reply.code(400).send({ error: 'Environment does not belong to project' });
        return;
      }
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'Approval rules require a user session' });
      return;
    }
    const rule = await prisma.approvalRule.create({
      data: {
        projectId,
        name: body.name.trim(),
        environmentId: body.environmentId ?? null,
        keyPattern: body.keyPattern.trim(),
        actionsJson: body.actions,
        isActive: body.isActive ?? true,
        createdBy: auth.user.id,
      },
    });
    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.rule.create',
      resourceType: 'approval_rule',
      resourceId: rule.id,
      metadataJson: { name: rule.name },
    });
    reply.code(201).send(toApprovalRuleDto(rule));
  });

  app.patch('/approval-rules/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const rule = await prisma.approvalRule.findUnique({ where: { id } });
    if (!rule) {
      reply.code(404).send({ error: 'Approval rule not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, rule.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    const body = request.body as
      | {
          name?: string;
          environmentId?: string | null;
          keyPattern?: string;
          actions?: ApprovalAction[];
          isActive?: boolean;
        }
      | undefined;
    const nextActions = Array.isArray(body?.actions) ? body?.actions : undefined;
    const hasEnvId = !!body && Object.prototype.hasOwnProperty.call(body, 'environmentId');
    const nextEnvId = hasEnvId ? body?.environmentId ?? null : undefined;
    if (nextEnvId) {
      const env = await prisma.environment.findUnique({ where: { id: nextEnvId } });
      if (!env || env.projectId !== rule.projectId) {
        reply.code(400).send({ error: 'Environment does not belong to project' });
        return;
      }
    }
    const updated = await prisma.approvalRule.update({
      where: { id },
      data: {
        name: body?.name?.trim() ?? undefined,
        environmentId: nextEnvId,
        keyPattern: body?.keyPattern?.trim() ?? undefined,
        actionsJson: nextActions ?? undefined,
        isActive: body?.isActive ?? undefined,
      },
    });
    await logAudit({
      projectId: rule.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.rule.update',
      resourceType: 'approval_rule',
      resourceId: id,
    });
    reply.send(toApprovalRuleDto(updated));
  });

  app.delete('/approval-rules/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const rule = await prisma.approvalRule.findUnique({ where: { id } });
    if (!rule) {
      reply.code(404).send({ error: 'Approval rule not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, rule.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    await prisma.approvalRule.delete({ where: { id } });
    await logAudit({
      projectId: rule.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.rule.delete',
      resourceType: 'approval_rule',
      resourceId: id,
    });
    reply.send({ ok: true });
  });

  app.get('/projects/:id/approvals', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const query = (request.query ?? {}) as {
      status?: ApprovalStatus;
      environmentId?: string;
      action?: ApprovalAction;
      requestedBy?: string;
    };
    const approvals = await prisma.approvalRequest.findMany({
      where: {
        projectId,
        status: query.status,
        environmentId: query.environmentId,
        action: query.action,
        requestedBy: query.requestedBy,
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(approvals.map(toApprovalRequestDto));
  });

  app.get('/approvals/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    let proposedValue: string | null = null;
    let currentValue: string | null = null;
    if (role === Role.ADMIN) {
      if (approval.payloadCiphertext && approval.payloadIv && approval.payloadTag) {
        proposedValue = decryptSecret(
          {
            ciphertext: approval.payloadCiphertext,
            iv: approval.payloadIv,
            tag: approval.payloadTag,
          },
          masterKey,
        );
      }
      if (approval.secretId) {
        const secret = await prisma.secret.findUnique({
          where: { id: approval.secretId },
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        const version = secret?.versions[0];
        if (version) {
          currentValue = decryptSecret(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            masterKey,
          );
        }
      }
    }
    reply.send(
      toApprovalRequestDto({
        ...approval,
        proposedValue,
        currentValue,
      }),
    );
  });

  app.post('/approvals/:id/approve', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      reply.code(409).send({ error: 'Approval request is not pending' });
      return;
    }

    const applied = await prisma.$transaction(async (tx) => {
      let resourceId: string | null = approval.secretId ?? null;
      let auditAction: string | null = null;
      await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedBy: auth.user!.id,
          approvedAt: new Date(),
        },
      });

      if (approval.action === ApprovalAction.CREATE) {
        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: { environmentId: approval.environmentId, key: approval.key },
          },
        });
        if (existing) {
          throw new Error('Secret already exists');
        }
        if (!approval.payloadCiphertext || !approval.payloadIv || !approval.payloadTag) {
          throw new Error('Missing payload');
        }
        const secret = await tx.secret.create({
          data: {
            environmentId: approval.environmentId,
            key: approval.key,
          },
        });
        resourceId = secret.id;
        auditAction = 'secret.create';
        await tx.secretVersion.create({
          data: {
            secretId: secret.id,
            ciphertext: approval.payloadCiphertext,
            iv: approval.payloadIv,
            tag: approval.payloadTag,
            keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
      }

      if (approval.action === ApprovalAction.UPDATE) {
        if (!approval.secretId) {
          throw new Error('Missing secret');
        }
        const secret = await tx.secret.findUnique({
          where: { id: approval.secretId },
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        if (approval.key !== secret.key) {
          const existing = await tx.secret.findUnique({
            where: {
              environmentId_key: {
                environmentId: secret.environmentId,
                key: approval.key,
              },
            },
          });
          if (existing && existing.id !== secret.id) {
            throw new Error('Key already exists in this environment');
          }
        }
        const payload = approval.payloadCiphertext
          ? {
              ciphertext: approval.payloadCiphertext,
              iv: approval.payloadIv!,
              tag: approval.payloadTag!,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            }
          : null;
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        if (payload) {
          updates.push(
            tx.secretVersion.updateMany({
              where: { secretId: secret.id },
              data: { isActive: false },
            }),
            tx.secretVersion.create({
              data: {
                secretId: secret.id,
                ciphertext: payload.ciphertext,
                iv: payload.iv,
                tag: payload.tag,
                keyVersion: payload.keyVersion,
                createdBy: auth.user?.id,
                isActive: true,
              },
            }),
          );
        }
        updates.push(
          tx.secret.update({
            where: { id: secret.id },
            data: { key: approval.key, updatedAt: new Date(), deletedAt: null },
          }),
        );
        for (const update of updates) {
          await update;
        }
        auditAction = 'secret.update';
      }

      if (approval.action === ApprovalAction.DELETE) {
        if (!approval.secretId) {
          throw new Error('Missing secret');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          where: { id: approval.secretId },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        await tx.secret.update({
          where: { id: secret.id },
          data: { deletedAt: new Date() },
        });
        auditAction = 'secret.delete';
      }

      if (approval.action === ApprovalAction.ROLLBACK) {
        if (!approval.secretId || !approval.expectedVersionId) {
          throw new Error('Missing rollback version');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: { where: { id: approval.expectedVersionId } },
          },
          where: { id: approval.secretId },
        });
        if (!secret || secret.versions.length === 0) {
          throw new Error('Secret not found');
        }
        await tx.secretVersion.updateMany({
          where: { secretId: secret.id },
          data: { isActive: false },
        });
        await tx.secretVersion.update({
          where: { id: approval.expectedVersionId },
          data: { isActive: true },
        });
        await tx.secret.update({
          where: { id: secret.id },
          data: { updatedAt: new Date(), deletedAt: null },
        });
        auditAction = 'secret.rollback';
      }

      if (approval.action === ApprovalAction.COPY || approval.action === ApprovalAction.COPY_FROM) {
        if (!approval.secretId || !approval.targetEnvironmentId) {
          throw new Error('Missing copy target');
        }
        const targetEnv = await tx.environment.findUnique({
          where: { id: approval.targetEnvironmentId },
        });
        if (!targetEnv || targetEnv.projectId !== approval.projectId) {
          throw new Error('Target environment not found');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            environment: true,
          },
          where: { id: approval.secretId },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        const value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
        const payload = encryptSecret(value, masterKey);
        const keyVersion = masterKeyVersion();
        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: {
              environmentId: approval.targetEnvironmentId,
              key: secret.key,
            },
          },
        });
        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const created = await tx.secret.create({
            data: {
              environmentId: approval.targetEnvironmentId,
              key: secret.key,
            },
          });
          targetSecretId = created.id;
        }
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
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
        resourceId = targetSecretId;
        auditAction = 'secret.copy';
      }

      return { resourceId, auditAction };
    });

    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.approved',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    if (applied.auditAction) {
      await logAudit({
        projectId: approval.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: applied.auditAction,
        resourceType: 'secret',
        resourceId: applied.resourceId,
        metadataJson: {
          requestedBy: approval.requestedBy,
          action: approval.action,
          key: approval.key,
          environmentId: approval.environmentId,
          targetEnvironmentId: approval.targetEnvironmentId ?? undefined,
        },
      });
    }

    reply.send({ ok: true });
  });

  app.post('/approvals/:id/deny', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      reply.code(409).send({ error: 'Approval request is not pending' });
      return;
    }
    await prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.DENIED, deniedAt: new Date() },
    });
    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.denied',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    reply.send({ ok: true });
  });

  app.post('/approvals/:id/cancel', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const isRequester = approval.requestedBy === auth.user!.id;
    const isAdmin = role === Role.ADMIN;
    if (!isRequester && !isAdmin) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      reply.code(409).send({ error: 'Approval request is not pending' });
      return;
    }
    await prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.CANCELED, canceledAt: new Date() },
    });
    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.canceled',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    reply.send({ ok: true });
  });

  app.post('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Tokens cannot create environments' });
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
                    createdBy: auth.user?.id,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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

    const scopedEnvIds = request.auth?.scopeEnvironmentIds;
    const envs = await prisma.environment.findMany({
      where: {
        projectId,
        ...(request.auth?.viaToken && scopedEnvIds ? { id: { in: scopedEnvIds } } : {}),
      },
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
    if (!requireEnvironmentScope(request, reply, env.id)) {
      return;
    }

    reply.send(toEnvironmentDto(env));
  });

  app.get('/projects/:id/secrets/search', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const query = request.query as {
      q?: string;
      environmentId?: string;
      includeValues?: string;
    };

    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const q = query.q?.trim();
    if (!q) {
      reply.send([]);
      return;
    }

    const where: Prisma.SecretWhereInput = {
      deletedAt: null,
      environment: { projectId },
      key: { contains: q },
    };

    const scopedEnvIds = request.auth?.scopeEnvironmentIds;
    if (query.environmentId) {
      if (request.auth?.viaToken && scopedEnvIds && !scopedEnvIds.includes(query.environmentId)) {
        reply.code(403).send({ error: 'Token does not have access to this environment' });
        return;
      }
      where.environmentId = query.environmentId;
    } else if (request.auth?.viaToken && scopedEnvIds) {
      where.environmentId = { in: scopedEnvIds };
    }

    const secrets = await prisma.secret.findMany({
      where,
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
      take: 200,
    });

    const canViewValues =
      query.includeValues === 'true' && ROLE_RANK[role] >= ROLE_RANK.EDITOR;

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
        key: secret.key,
        environmentId: secret.environmentId,
        environmentName: secret.environment.name,
        updatedAt: secret.updatedAt.toISOString(),
        value,
      };
    });

    reply.send(data);
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
    if (!requireEnvironmentScope(request, reply, envId)) {
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

    const matchingRules = await findMatchingApprovalRules({
      projectId: env.projectId,
      environmentId: envId,
      action: ApprovalAction.CREATE,
      key: body.key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: env.projectId,
        environmentId: envId,
        action: ApprovalAction.CREATE,
        key: body.key,
        secretId: null,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const payload = encryptSecret(body.value, masterKey);
      const keyVersion = masterKeyVersion();
      const approval = await createApprovalRequest({
        projectId: env.projectId,
        environmentId: envId,
        action: ApprovalAction.CREATE,
        key: body.key,
        requestedBy: auth.user!.id,
        payload: { ...payload, keyVersion },
      });
      await logAudit({
        projectId: env.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'CREATE', key: body.key, environmentId: envId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
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
          createdBy: auth.user?.id,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.create',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: { key: body.key, environmentId: envId },
    });

    reply.code(201).send({ id: secretId });
  });

  app.post('/environments/:id/secrets/bulk', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const body = request.body as
      | { entries?: { key?: string; value?: string }[]; overwrite?: boolean }
      | undefined;

    const entries = body?.entries ?? [];
    if (entries.length === 0) {
      reply.code(400).send({ error: 'Entries are required' });
      return;
    }
    if (entries.length > 500) {
      reply.code(400).send({ error: 'Too many entries (max 500).' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, envId)) {
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const deduped = new Map<string, string>();
    for (const entry of entries) {
      const key = typeof entry.key === 'string' ? entry.key.trim() : '';
      const value = typeof entry.value === 'string' ? entry.value : undefined;
      if (!key || value === undefined) {
        reply.code(400).send({ error: 'Each entry must include key and value' });
        return;
      }
      deduped.set(key, value);
    }

    const keys = Array.from(deduped.keys());
    if (keys.length === 0) {
      reply.code(400).send({ error: 'Entries are required' });
      return;
    }

    const existingSecrets = await prisma.secret.findMany({
      where: { environmentId: envId, key: { in: keys } },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const existingByKey = new Map(existingSecrets.map((secret) => [secret.key, secret]));
    const activeByKey = new Map(
      existingSecrets
        .filter((secret) => secret.deletedAt === null)
        .map((secret) => [secret.key, secret]),
    );

    const overwrite = Boolean(body?.overwrite);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let pending = 0;
    const approvalRequestIds: string[] = [];

    for (const [key, value] of deduped.entries()) {
      const active = activeByKey.get(key);
      const existing = existingByKey.get(key);
      if (active && !overwrite) {
        skipped += 1;
        continue;
      }

      const isCreate = !existing;
      const action = isCreate ? ApprovalAction.CREATE : ApprovalAction.UPDATE;

      const matchingRules = await findMatchingApprovalRules({
        projectId: env.projectId,
        environmentId: envId,
        action,
        key,
      });
      if (matchingRules.length > 0) {
        if (!requireUserForApproval(request, reply)) {
          return;
        }
        const existingApproval = await findPendingApprovalRequest({
          projectId: env.projectId,
          environmentId: envId,
          action,
          key,
          secretId: isCreate ? null : existing?.id ?? null,
        });
        if (existingApproval) {
          pending += 1;
          approvalRequestIds.push(existingApproval.id);
          continue;
        }
        const encrypted = encryptSecret(value, masterKey);
        const keyVersion = masterKeyVersion();
        const approval = await createApprovalRequest({
          projectId: env.projectId,
          environmentId: envId,
          action,
          key,
          requestedBy: auth.user!.id,
          secretId: isCreate ? undefined : existing?.id,
          expectedVersionId: isCreate ? undefined : existing?.versions[0]?.id,
          payload: { ...encrypted, keyVersion },
        });
        await logAudit({
          projectId: env.projectId,
          actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
          action: 'approval.requested',
          resourceType: 'approval_request',
          resourceId: approval.id,
          metadataJson: {
            action: action === ApprovalAction.CREATE ? 'CREATE' : 'UPDATE',
            key,
            environmentId: envId,
            secretId: existing?.id,
          },
        });
        pending += 1;
        approvalRequestIds.push(approval.id);
        continue;
      }

      const payload = encryptSecret(value, masterKey);
      const keyVersion = masterKeyVersion();

      let secretId = existing?.id;
      if (!secretId) {
        const secret = await prisma.secret.create({
          data: {
            environmentId: envId,
            key,
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
            createdBy: auth.user?.id,
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
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: isCreate ? 'secret.create' : 'secret.update',
        resourceType: 'secret',
        resourceId: secretId,
        metadataJson: { key, environmentId: envId },
      });

      if (isCreate) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    reply.send({ created, updated, skipped, pending, approvalRequestIds });
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
    if (!requireEnvironmentScope(request, reply, secret.environmentId)) {
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
    const requestedKey = nextKey ?? secret.key;
    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.UPDATE,
      key: requestedKey,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.UPDATE,
        key: requestedKey,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      let payload:
        | { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; tag: Uint8Array<ArrayBuffer>; keyVersion: string }
        | null = null;
      if (nextValue) {
        const encrypted = encryptSecret(nextValue, masterKey);
        payload = { ...encrypted, keyVersion: masterKeyVersion() };
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.UPDATE,
        key: requestedKey,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: activeVersion?.id,
        payload,
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'UPDATE', key: requestedKey, secretId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
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
            createdBy: auth.user?.id,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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

    const approvalRequestIds: string[] = [];
    for (const targetEnv of targetEnvs) {
      const rules = await findMatchingApprovalRules({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
      });
      if (rules.length === 0) {
        continue;
      }
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
        secretId: secretId,
        targetEnvironmentId: targetEnv.id,
      });
      if (existing) {
        approvalRequestIds.push(existing.id);
        continue;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        targetEnvironmentId: targetEnv.id,
        expectedVersionId: activeVersion.id,
      });
      approvalRequestIds.push(approval.id);
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          action: 'COPY',
          key: secret.key,
          secretId,
          targetEnvironmentId: targetEnv.id,
        },
      });
    }
    if (approvalRequestIds.length > 0) {
      reply.code(202).send({ status: 'pending', approvalRequestIds });
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
            createdBy: auth.user?.id,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
    if (!requireEnvironmentScope(request, reply, targetEnvId)) {
      return;
    }

    const sourceEnv = await prisma.environment.findUnique({ where: { id: sourceEnvironmentId } });
    if (!sourceEnv) {
      reply.code(404).send({ error: 'Source environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, sourceEnvironmentId)) {
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

    const approvalRequestIds: string[] = [];
    for (const sourceSecret of sourceSecrets) {
      const rules = await findMatchingApprovalRules({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
      });
      if (rules.length === 0) {
        continue;
      }
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const version = sourceSecret.versions[0];
      const existing = await findPendingApprovalRequest({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
        secretId: sourceSecret.id,
        targetEnvironmentId: targetEnv.id,
      });
      if (existing) {
        approvalRequestIds.push(existing.id);
        continue;
      }
      const approval = await createApprovalRequest({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
        requestedBy: auth.user!.id,
        secretId: sourceSecret.id,
        targetEnvironmentId: targetEnv.id,
        expectedVersionId: version?.id,
        metadataJson: { sourceEnvironmentId: sourceEnv.id, overwrite },
      });
      approvalRequestIds.push(approval.id);
      await logAudit({
        projectId: targetEnv.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          action: 'COPY_FROM',
          key: sourceSecret.key,
          secretId: sourceSecret.id,
          targetEnvironmentId: targetEnv.id,
          sourceEnvironmentId: sourceEnv.id,
        },
      });
    }
    if (approvalRequestIds.length > 0) {
      reply.code(202).send({ status: 'pending', approvalRequestIds });
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
            createdBy: auth.user?.id,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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

    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.ROLLBACK,
      key: secret.key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.ROLLBACK,
        key: secret.key,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.ROLLBACK,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: target.id,
        metadataJson: { versionId: target.id },
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'ROLLBACK', key: secret.key, secretId, versionId: target.id },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    await prisma.$transaction([
      prisma.secretVersion.updateMany({ where: { secretId }, data: { isActive: false } }),
      prisma.secretVersion.update({ where: { id: target.id }, data: { isActive: true } }),
    ]);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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

  app.get('/secrets/:id/versions', async (request, reply) => {
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
      Role.VIEWER,
    );
    if (!role) {
      return;
    }

    const versions = await prisma.secretVersion.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, isActive: true },
    });

    reply.send(
      versions.map((version) => ({
        id: version.id,
        createdAt: version.createdAt.toISOString(),
        isActive: version.isActive,
      })),
    );
  });

  app.get('/secrets/diff', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { secretId, from, to } = request.query as {
      secretId?: string;
      from?: string;
      to?: string;
    };

    if (!secretId) {
      reply.code(400).send({ error: 'secretId is required' });
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

    let versions: Array<{
      id: string;
      ciphertext: Uint8Array<ArrayBuffer>;
      iv: Uint8Array<ArrayBuffer>;
      tag: Uint8Array<ArrayBuffer>;
      createdAt: Date;
    }> = [];

    if (from && to) {
      versions = await prisma.secretVersion.findMany({
        where: { id: { in: [from, to] }, secretId },
        select: { id: true, ciphertext: true, iv: true, tag: true, createdAt: true },
      });
      if (versions.length !== 2) {
        reply.code(400).send({ error: 'Invalid version ids for diff' });
        return;
      }
    } else {
      versions = await prisma.secretVersion.findMany({
        where: { secretId },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { id: true, ciphertext: true, iv: true, tag: true, createdAt: true },
      });
      if (versions.length < 2) {
        reply.code(400).send({ error: 'Not enough versions to diff' });
        return;
      }
    }

    const [first, second] = versions;
    const current = from && to ? versions.find((v) => v.id === to)! : first;
    const previous = from && to ? versions.find((v) => v.id === from)! : second;

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
    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.DELETE,
      key: secret.key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.DELETE,
        key: secret.key,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.DELETE,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: activeVersion?.id,
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'DELETE', key: secret.key, secretId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    await prisma.secret.update({
      where: { id: secretId },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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

  app.get('/projects/:id/service-accounts', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Service accounts require a user session' });
      return;
    }
    if (!auth.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const accounts = await prisma.serviceAccount.findMany({
      where: { projectId },
      include: { environments: true },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(
      accounts.map((account) => ({
        id: account.id,
        projectId: account.projectId,
        name: account.name,
        createdAt: account.createdAt.toISOString(),
        createdBy: account.createdBy,
        environmentIds: account.environments.map((env) => env.environmentId),
      })),
    );
  });

  app.post('/projects/:id/service-accounts', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Service accounts require a user session' });
      return;
    }
    if (!auth.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const body = request.body as { name?: string; environmentIds?: string[] } | undefined;
    const name = body?.name?.trim();
    const environmentIds = Array.from(
      new Set(body?.environmentIds?.map((id) => id.trim()).filter(Boolean) ?? []),
    );
    if (!name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }
    if (environmentIds.length === 0) {
      reply.code(400).send({ error: 'Environment IDs are required' });
      return;
    }

    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const envs = await prisma.environment.findMany({
      where: { id: { in: environmentIds }, projectId },
      select: { id: true },
    });
    if (envs.length !== environmentIds.length) {
      reply.code(400).send({ error: 'One or more environments are invalid' });
      return;
    }

    const account = await prisma.serviceAccount.create({
      data: {
        projectId,
        name,
        createdBy: auth.user.id,
        environments: {
          create: environmentIds.map((environmentId) => ({ environmentId })),
        },
      },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'service_account.create',
      resourceType: 'service_account',
      resourceId: account.id,
    });

    reply.code(201).send({
      id: account.id,
      projectId: account.projectId,
      name: account.name,
      createdAt: account.createdAt.toISOString(),
      createdBy: account.createdBy,
      environmentIds,
    });
  });

  app.delete('/projects/:id/service-accounts/:serviceAccountId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Service accounts require a user session' });
      return;
    }
    if (!auth.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const { id: projectId, serviceAccountId } = request.params as {
      id: string;
      serviceAccountId: string;
    };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const account = await prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, projectId },
    });
    if (!account) {
      reply.code(404).send({ error: 'Service account not found' });
      return;
    }

    await prisma.serviceAccount.delete({ where: { id: account.id } });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'service_account.delete',
      resourceType: 'service_account',
      resourceId: account.id,
    });

    reply.code(204).send();
  });

  app.get('/service-accounts/:id/tokens', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Service accounts require a user session' });
      return;
    }
    if (!auth.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const { id: serviceAccountId } = request.params as { id: string };
    const account = await prisma.serviceAccount.findUnique({
      where: { id: serviceAccountId },
    });
    if (!account) {
      reply.code(404).send({ error: 'Service account not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, account.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const tokens = await prisma.serviceAccountToken.findMany({
      where: { serviceAccountId },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(
      tokens.map((token) => ({
        id: token.id,
        serviceAccountId: token.serviceAccountId,
        name: token.name,
        readOnly: token.readOnly,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      })),
    );
  });

  app.post('/service-accounts/:id/tokens', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Service accounts require a user session' });
      return;
    }
    if (!auth.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const { id: serviceAccountId } = request.params as { id: string };
    const body = request.body as
      | { name?: string; readOnly?: boolean; environmentIds?: string[]; expiresAt?: string | null }
      | undefined;
    const name = body?.name?.trim();
    const environmentIds = Array.from(
      new Set(body?.environmentIds?.map((id) => id.trim()).filter(Boolean) ?? []),
    );
    if (!name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }
    if (environmentIds.length === 0) {
      reply.code(400).send({ error: 'Environment IDs are required' });
      return;
    }

    const account = await prisma.serviceAccount.findUnique({
      where: { id: serviceAccountId },
    });
    if (!account) {
      reply.code(404).send({ error: 'Service account not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, account.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const envs = await prisma.environment.findMany({
      where: { id: { in: environmentIds }, projectId: account.projectId },
      select: { id: true },
    });
    if (envs.length !== environmentIds.length) {
      reply.code(400).send({ error: 'One or more environments are invalid' });
      return;
    }

    const raw = generateToken();
    const token = await prisma.serviceAccountToken.create({
      data: {
        serviceAccountId,
        name,
        tokenHash: hashToken(raw),
        readOnly: body?.readOnly === true,
        expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await prisma.serviceAccountTokenEnvironment.createMany({
      data: environmentIds.map((environmentId) => ({
        serviceAccountTokenId: token.id,
        environmentId,
      })),
    });

    await logAudit({
      projectId: account.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'service_account.token.create',
      resourceType: 'service_account_token',
      resourceId: token.id,
      metadataJson: { serviceAccountId },
    });

    reply.send({
      token: raw,
      tokenMeta: {
        id: token.id,
        serviceAccountId: token.serviceAccountId,
        name: token.name,
        readOnly: token.readOnly,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      },
    });
  });

  app.delete('/service-accounts/:id/tokens/:tokenId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      reply.code(403).send({ error: 'Service accounts require a user session' });
      return;
    }
    if (!auth.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const { id: serviceAccountId, tokenId } = request.params as {
      id: string;
      tokenId: string;
    };
    const account = await prisma.serviceAccount.findUnique({
      where: { id: serviceAccountId },
    });
    if (!account) {
      reply.code(404).send({ error: 'Service account not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, account.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const token = await prisma.serviceAccountToken.findFirst({
      where: { id: tokenId, serviceAccountId },
    });
    if (!token) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }

    await prisma.serviceAccountToken.delete({ where: { id: token.id } });

    await logAudit({
      projectId: account.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'service_account.token.delete',
      resourceType: 'service_account_token',
      resourceId: token.id,
      metadataJson: { serviceAccountId },
    });

    reply.code(204).send();
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
        createdBy: auth.user!.id,
        readOnly: body.readOnly === true,
        expiresAt,
      },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
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

    const query = request.query as
      | {
          projectId?: string;
          start?: string;
          end?: string;
          action?: string;
          resourceType?: string;
          resourceId?: string;
          actorUserId?: string;
          actorServiceAccountId?: string;
          limit?: string;
        }
      | undefined;
    const projectId = query?.projectId;
    if (!projectId) {
      reply.code(400).send({ error: 'projectId is required' });
      return;
    }

    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const startDate = parseDateInput(query?.start);
    const endDate = parseDateInput(query?.end);
    if ((query?.start && !startDate) || (query?.end && !endDate)) {
      reply.code(400).send({ error: 'Invalid start or end date' });
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      reply.code(400).send({ error: 'start must be before end' });
      return;
    }

    const limitRaw = query?.limit ? Number(query.limit) : 200;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const where: Prisma.AuditLogWhereInput = {
      projectId,
      action: query?.action ?? undefined,
      resourceType: query?.resourceType ?? undefined,
      resourceId: query?.resourceId ?? undefined,
      actorUserId: query?.actorUserId ?? undefined,
      actorServiceAccountId: query?.actorServiceAccountId ?? undefined,
      createdAt:
        startDate || endDate
          ? {
              gte: startDate ?? undefined,
              lte: endDate ?? undefined,
            }
          : undefined,
    };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    reply.send(
      logs.map((log) => ({
        id: log.id,
        projectId: log.projectId,
        actorUserId: log.actorUserId,
        actorServiceAccountId: log.actorServiceAccountId,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        metadataJson: (log.metadataJson as Record<string, unknown> | null) ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
    );
  });

  let auditCleanupRunning = false;
  const runAuditRetentionCleanup = async () => {
    if (auditCleanupRunning) {
      return;
    }
    auditCleanupRunning = true;
    try {
      const projects = await prisma.project.findMany({
        where: { auditRetentionDays: { not: null } },
        select: { id: true, auditRetentionDays: true },
      });

      const now = new Date();
      for (const project of projects) {
        if (project.auditRetentionDays === null) continue;
        const cutoff = new Date(
          now.getTime() - project.auditRetentionDays * 24 * 60 * 60 * 1000,
        );
        const result = await prisma.auditLog.deleteMany({
          where: { projectId: project.id, createdAt: { lt: cutoff } },
        });
        if (result.count > 0) {
          app.log.info(
            {
              projectId: project.id,
              deleted: result.count,
              cutoff: cutoff.toISOString(),
            },
            'audit retention cleanup',
          );
        }
      }
    } catch (error) {
      app.log.error({ err: error }, 'audit retention cleanup failed');
    } finally {
      auditCleanupRunning = false;
    }
  };

  setTimeout(() => {
    void runAuditRetentionCleanup();
  }, 60 * 1000);
  setInterval(() => {
    void runAuditRetentionCleanup();
  }, 24 * 60 * 60 * 1000);

  return app;
}
