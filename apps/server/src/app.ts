import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
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

const ROLE_RANK: Record<Role, number> = {
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

function isRole(value: string): value is Role {
  return value === 'ADMIN' || value === 'EDITOR' || value === 'VIEWER';
}

function toUserDto(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}

function toProjectDto(
  project: { id: string; name: string; createdAt: Date; updatedAt: Date },
  role?: Role,
) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    role,
  };
}

function toEnvironmentDto(env: {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
  };
}

function formatDotenvValue(value: string): string {
  if (/\s|#|"|\\|\n/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
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
          where: { tokenHash },
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
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return;
    }

    if (request.auth?.viaToken) {
      return;
    }

    const origin = request.headers.origin;
    if (!origin || origin !== config.appOrigin) {
      return reply.code(403).send({ error: 'Invalid origin' });
    }
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/auth/register', async (request, reply) => {
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

    reply.setCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: config.sessionTtlHours * 60 * 60,
    });

    reply.code(201).send({ user: toUserDto(user) });
  });

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

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });

      reply.send({ user: toUserDto(user) });
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await prisma.userSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      });
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.send({ ok: true });
  });

  app.get('/me', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    reply.send({ user: auth.user });
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

    const project = await prisma.project.create({
      data: {
        name: body.name,
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

    const env = await prisma.environment.create({
      data: {
        projectId,
        name: body.name,
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
    const body = request.body as { value?: string } | undefined;
    if (body?.value === undefined) {
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

    const payload = encryptSecret(body.value, masterKey);
    const keyVersion = masterKeyVersion();

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
      projectId: secret.environment.projectId,
      actorUserId: auth.user.id,
      action: 'secret.update',
      resourceType: 'secret',
      resourceId: secretId,
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

    const body = request.body as { name?: string } | undefined;
    if (!body?.name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }

    const raw = generateToken();
    const token = await prisma.apiToken.create({
      data: {
        projectId,
        name: body.name,
        tokenHash: hashToken(raw),
        createdBy: auth.user.id,
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
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
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
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
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
