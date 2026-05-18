import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
      sendError(reply, 404, 'Project not found');
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
      sendError(reply, 400, 'auditRetentionDays is required');
      return;
    }

    if (body.auditRetentionDays !== null) {
      const value = Number(body.auditRetentionDays);
      if (!Number.isFinite(value) || value < 1) {
        sendError(reply, 400, 'auditRetentionDays must be >= 1 or null');
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
}
