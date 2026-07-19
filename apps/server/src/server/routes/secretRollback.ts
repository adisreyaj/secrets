import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, Role, secrets, secretVersions } from '../../db/index.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/secrets/:id/rollback', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as { versionId?: string } | undefined;

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

    const versions = await db.query.secretVersions.findMany({
      where: eq(secretVersions.secretId, secretId),
      orderBy: [desc(secretVersions.createdAt)],
    });

    if (versions.length < 2 && !body?.versionId) {
      sendError(reply, 400, 'No previous version to rollback');
      return;
    }

    const target = body?.versionId ? versions.find((v) => v.id === body.versionId) : versions[1];

    if (!target) {
      sendError(reply, 404, 'Version not found');
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(secretVersions)
        .set({ isActive: false })
        .where(eq(secretVersions.secretId, secretId));
      await tx
        .update(secretVersions)
        .set({ isActive: true })
        .where(eq(secretVersions.id, target.id));
    });

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
}
