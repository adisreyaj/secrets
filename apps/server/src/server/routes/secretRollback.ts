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

    const versions = await prisma.secretVersion.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
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
}
