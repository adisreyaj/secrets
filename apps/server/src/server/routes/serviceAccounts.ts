import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { unauthorized } from '../http/errors.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects/:id/service-accounts', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.viaToken) {
      sendError(reply, 403, 'Service accounts require a user session');
      return;
    }
    if (!auth.user) {
      unauthorized(reply);
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
      sendError(reply, 403, 'Service accounts require a user session');
      return;
    }
    if (!auth.user) {
      unauthorized(reply);
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const body = request.body as { name?: string; environmentIds?: string[] } | undefined;
    const name = body?.name?.trim();
    const environmentIds = Array.from(
      new Set(body?.environmentIds?.map((id) => id.trim()).filter(Boolean) ?? []),
    );
    if (!name) {
      sendError(reply, 400, 'Name is required');
      return;
    }
    if (environmentIds.length === 0) {
      sendError(reply, 400, 'Environment IDs are required');
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
      sendError(reply, 400, 'One or more environments are invalid');
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
      sendError(reply, 403, 'Service accounts require a user session');
      return;
    }
    if (!auth.user) {
      unauthorized(reply);
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
      sendError(reply, 404, 'Service account not found');
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
      sendError(reply, 403, 'Service accounts require a user session');
      return;
    }
    if (!auth.user) {
      unauthorized(reply);
      return;
    }

    const { id: serviceAccountId } = request.params as { id: string };
    const account = await prisma.serviceAccount.findUnique({
      where: { id: serviceAccountId },
    });
    if (!account) {
      sendError(reply, 404, 'Service account not found');
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
      sendError(reply, 403, 'Service accounts require a user session');
      return;
    }
    if (!auth.user) {
      unauthorized(reply);
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
      sendError(reply, 400, 'Name is required');
      return;
    }
    if (environmentIds.length === 0) {
      sendError(reply, 400, 'Environment IDs are required');
      return;
    }

    const account = await prisma.serviceAccount.findUnique({
      where: { id: serviceAccountId },
    });
    if (!account) {
      sendError(reply, 404, 'Service account not found');
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
      sendError(reply, 400, 'One or more environments are invalid');
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
      sendError(reply, 403, 'Service accounts require a user session');
      return;
    }
    if (!auth.user) {
      unauthorized(reply);
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
      sendError(reply, 404, 'Service account not found');
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
      sendError(reply, 404, 'Token not found');
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
}
