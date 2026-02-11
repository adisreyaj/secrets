import { ApprovalAction, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { encryptSecret, loadMasterKey, masterKeyVersion } from '../../crypto.js';
import { prisma } from '../../db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
  requireUserForApproval,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import {
  createApprovalRequest,
  findMatchingApprovalRules,
  findPendingApprovalRequest,
} from '../services/approvals.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

  app.patch('/secrets/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string } | undefined;
    const nextKeyRaw = typeof body?.key === 'string' ? body?.key : undefined;
    const nextValueRaw = typeof body?.value === 'string' ? body?.value : undefined;
    const nextKey = nextKeyRaw?.trim();
    const nextValue = nextValueRaw?.trim();
    if (nextKeyRaw === undefined && nextValueRaw === undefined) {
      sendError(reply, 400, 'Key or value is required');
      return;
    }
    if (nextKeyRaw !== undefined && !nextKey) {
      sendError(reply, 400, 'Key is required');
      return;
    }
    if (nextValueRaw !== undefined && !nextValue) {
      sendError(reply, 400, 'Value is required');
      return;
    }

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
    if (!requireEnvironmentScope(request, reply, secret.environmentId)) {
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
    const requestedKey = nextKey ?? secret.key;
    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.UPDATE,
      key: requestedKey,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.UPDATE,
        key: requestedKey,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      let payload:
        | { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; tag: Uint8Array<ArrayBuffer>; keyVersion: string }
        | null = null;
      if (nextValue) {
        const encrypted = encryptSecret(nextValue, masterKey);
        payload = { ...encrypted, keyVersion: masterKeyVersion() };
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.UPDATE,
        key: requestedKey,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: activeVersion?.id,
        payload,
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'UPDATE', key: requestedKey, secretId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    const keyChanged = nextKey && nextKey !== secret.key;
    const normalizedKeyChanged =
      nextKey && normalizeIdentifier(nextKey) !== normalizeIdentifier(secret.key);
    if (normalizedKeyChanged && nextKey) {
      const siblings = await prisma.secret.findMany({
        where: { environmentId: secret.environmentId, deletedAt: null },
        select: { id: true, key: true },
      });
      const existing = siblings.find(
        (candidate) =>
          candidate.id !== secretId &&
          normalizeIdentifier(candidate.key) === normalizeIdentifier(nextKey),
      );
      if (existing) {
        sendError(reply, 409, 'Key already exists in this environment');
        return;
      }
    }

    const updateData: { key?: string; updatedAt: Date; deletedAt: null } = {
      updatedAt: new Date(),
      deletedAt: null,
    };
    if (keyChanged && nextKey) {
      updateData.key = nextKey;
    }

    const transactionOps = [];
    const valueChanged = nextValueRaw !== undefined;
    if (valueChanged && nextValue) {
      const payload = encryptSecret(nextValue, masterKey);
      const keyVersion = masterKeyVersion();
      transactionOps.push(
        prisma.secretVersion.updateMany({
          where: { secretId },
          data: { isActive: false },
        }),
        prisma.secretVersion.create({
          data: {
            secretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        }),
      );
    }
    transactionOps.push(
      prisma.secret.update({
        where: { id: secretId },
        data: updateData,
      }),
    );

    await prisma.$transaction(transactionOps);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.update',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: {
        previousKey: secret.key,
        updatedKey: keyChanged ? nextKey : secret.key,
        updatedValue: valueChanged,
      },
    });

    reply.send({ ok: true });
  });
}
