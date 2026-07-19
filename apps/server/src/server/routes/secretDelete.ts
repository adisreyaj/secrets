import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, Role, secrets } from '../../db/index.js';
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
      const secret = await db.query.secrets.findFirst({
        where: eq(secrets.id, secretId),
        with: {
          environment: true,
          versions: {
            where: (fields, { eq: eqOp }) => eqOp(fields.isActive, true),
            orderBy: (fields) => [desc(fields.createdAt)],
            limit: 1,
          },
        },
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

      await db.update(secrets).set({ deletedAt: new Date() }).where(eq(secrets.id, secretId));

      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'secret.delete',
        resourceType: 'secret',
        resourceId: secretId,
      });

      reply.send({ ok: true });
    },
  );
}
