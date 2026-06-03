import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateToken, hashToken } from '../../auth.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/projects/:id/api-tokens',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        body: z.object({
          name: z.string().min(1, 'Name is required'),
          readOnly: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
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
      sendError(reply, 400, 'Name is required');
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

  app.get(
    '/projects/:id/api-tokens',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: projectId } = request.params as { id: string };
      const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
      if (!role) {
        return;
      }

      const query = request.query as { limit: number; cursor?: string };
      const limit = query.limit;
      const cursor = query.cursor;

      const tokens = await prisma.apiToken.findMany({
        where: { projectId },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined = undefined;
      if (tokens.length > limit) {
        const nextItem = tokens.pop();
        nextCursor = nextItem?.id;
      }

      reply.send({
        data: tokens.map((token) => ({
          id: token.id,
          projectId: token.projectId,
          name: token.name,
          readOnly: token.readOnly,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          expiresAt: token.expiresAt?.toISOString() ?? null,
        })),
        nextCursor,
      });
    },
  );

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
      sendError(reply, 404, 'Token not found');
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
}
