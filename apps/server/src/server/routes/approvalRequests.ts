import { ApprovalAction, ApprovalStatus, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { decryptSecret, loadMasterKey } from '../../crypto.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { forbidden } from '../http/errors.js';
import { sendError } from '../http/replies.js';
import { toApprovalRequestDto } from '../mappers/approvals.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

  app.get('/projects/:id/approvals', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const query = (request.query ?? {}) as {
      status?: ApprovalStatus;
      environmentId?: string;
      action?: ApprovalAction;
      requestedBy?: string;
    };
    const approvals = await prisma.approvalRequest.findMany({
      where: {
        projectId,
        status: query.status,
        environmentId: query.environmentId,
        action: query.action,
        requestedBy: query.requestedBy,
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(approvals.map(toApprovalRequestDto));
  });

  app.get('/approvals/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      sendError(reply, 404, 'Approval request not found');
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    let proposedValue: string | null = null;
    let currentValue: string | null = null;
    if (role === Role.ADMIN) {
      if (approval.payloadCiphertext && approval.payloadIv && approval.payloadTag) {
        proposedValue = decryptSecret(
          {
            ciphertext: approval.payloadCiphertext,
            iv: approval.payloadIv,
            tag: approval.payloadTag,
          },
          masterKey,
        );
      }
      if (approval.secretId) {
        const secret = await prisma.secret.findUnique({
          where: { id: approval.secretId },
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        const version = secret?.versions[0];
        if (version) {
          currentValue = decryptSecret(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            masterKey,
          );
        }
      }
    }
    reply.send(
      toApprovalRequestDto({
        ...approval,
        proposedValue,
        currentValue,
      }),
    );
  });

  app.post('/approvals/:id/deny', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      sendError(reply, 404, 'Approval request not found');
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      sendError(reply, 409, 'Approval request is not pending');
      return;
    }
    await prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.DENIED, deniedAt: new Date() },
    });
    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.denied',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    reply.send({ ok: true });
  });

  app.post('/approvals/:id/cancel', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      sendError(reply, 404, 'Approval request not found');
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const isRequester = approval.requestedBy === auth.user!.id;
    const isAdmin = role === Role.ADMIN;
    if (!isRequester && !isAdmin) {
      forbidden(reply);
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      sendError(reply, 409, 'Approval request is not pending');
      return;
    }
    await prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.CANCELED, canceledAt: new Date() },
    });
    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.canceled',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    reply.send({ ok: true });
  });
}
