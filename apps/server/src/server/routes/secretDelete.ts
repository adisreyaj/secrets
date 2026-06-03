import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';

const deleteSecretParamsSchema = z.object({
  id: z.string().uuid('Invalid secret ID'),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.delete(
    '/secrets/:id',
    {
      schema: {
        params: deleteSecretParamsSchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const params = request.params as z.infer<typeof deleteSecretParamsSchema>;
      const { id: secretId } = params;
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
      sendError(reply, 404, 'Secret not found');
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
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.delete',
      resourceType: 'secret',
      resourceId: secretId,
    });

    reply.send({ ok: true });
  });
}
