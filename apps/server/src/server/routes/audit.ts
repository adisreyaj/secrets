import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { auditLogs, db, Role } from '../../db/index.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { parseDateInput } from '../http/validators.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
      sendError(reply, 400, 'projectId is required');
      return;
    }

    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const startDate = parseDateInput(query?.start);
    const endDate = parseDateInput(query?.end);
    if ((query?.start && !startDate) || (query?.end && !endDate)) {
      sendError(reply, 400, 'Invalid start or end date');
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      sendError(reply, 400, 'start must be before end');
      return;
    }

    const limitRaw = query?.limit ? Number(query.limit) : 200;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const logs = await db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.projectId, projectId),
        query?.action ? eq(auditLogs.action, query.action) : undefined,
        query?.resourceType ? eq(auditLogs.resourceType, query.resourceType) : undefined,
        query?.resourceId ? eq(auditLogs.resourceId, query.resourceId) : undefined,
        query?.actorUserId ? eq(auditLogs.actorUserId, query.actorUserId) : undefined,
        query?.actorServiceAccountId
          ? eq(auditLogs.actorServiceAccountId, query.actorServiceAccountId)
          : undefined,
        startDate ? gte(auditLogs.createdAt, startDate) : undefined,
        endDate ? lte(auditLogs.createdAt, endDate) : undefined,
      ),
      orderBy: [desc(auditLogs.createdAt)],
      limit,
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
}
