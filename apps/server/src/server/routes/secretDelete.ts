import { ApprovalAction, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole, requireUserForApproval } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import {
  createApprovalRequest,
  findMatchingApprovalRules,
  findPendingApprovalRequest,
} from '../services/approvals.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
}
