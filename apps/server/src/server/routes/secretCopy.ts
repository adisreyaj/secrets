import { ApprovalAction, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from '../../crypto.js';
import { prisma } from '../../db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
  requireUserForApproval,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import {
  createApprovalRequest,
  findMatchingApprovalRules,
  findPendingApprovalRequest,
} from '../services/approvals.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

  app.post('/secrets/:id/copy', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as
      | { targetEnvironmentIds?: string[]; overwrite?: boolean }
      | undefined;
    const rawTargets = body?.targetEnvironmentIds?.filter((id) => id.trim().length > 0) ?? [];
    const targetIds = Array.from(new Set(rawTargets));
    if (targetIds.length === 0) {
      sendError(reply, 400, 'Target environments are required');
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
    if (!activeVersion) {
      sendError(reply, 400, 'Secret has no active version');
      return;
    }

    const targetIdsWithoutSource = targetIds.filter((id) => id !== secret.environmentId);
    if (targetIdsWithoutSource.length === 0) {
      sendError(reply, 400, 'No target environments provided');
      return;
    }

    const targetEnvs = await prisma.environment.findMany({
      where: { id: { in: targetIdsWithoutSource } },
    });
    if (targetEnvs.length !== targetIdsWithoutSource.length) {
      sendError(reply, 404, 'One or more environments not found');
      return;
    }

    if (targetEnvs.some((env) => env.projectId !== secret.environment.projectId)) {
      sendError(reply, 400, 'Targets must belong to the same project');
      return;
    }

    const approvalRequestIds: string[] = [];
    for (const targetEnv of targetEnvs) {
      const rules = await findMatchingApprovalRules({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
      });
      if (rules.length === 0) {
        continue;
      }
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
        secretId: secretId,
        targetEnvironmentId: targetEnv.id,
      });
      if (existing) {
        approvalRequestIds.push(existing.id);
        continue;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        targetEnvironmentId: targetEnv.id,
        expectedVersionId: activeVersion.id,
      });
      approvalRequestIds.push(approval.id);
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          action: 'COPY',
          key: secret.key,
          secretId,
          targetEnvironmentId: targetEnv.id,
        },
      });
    }
    if (approvalRequestIds.length > 0) {
      reply.code(202).send({ status: 'pending', approvalRequestIds });
      return;
    }

    const value = decryptSecret(
      { ciphertext: activeVersion.ciphertext, iv: activeVersion.iv, tag: activeVersion.tag },
      masterKey,
    );
    const keyVersion = masterKeyVersion();
    const overwrite = body?.overwrite === true;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const env of targetEnvs) {
        const existing = await tx.secret.findUnique({
          where: { environmentId_key: { environmentId: env.id, key: secret.key } },
        });

        if (existing && !overwrite) {
          skipped.push(env.id);
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const createdSecret = await tx.secret.create({
            data: { environmentId: env.id, key: secret.key },
          });
          targetSecretId = createdSecret.id;
          created.push(env.id);
        } else {
          updated.push(env.id);
        }

        const payload = encryptSecret(value, masterKey);

        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
      }
    });

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.copy',
      resourceType: 'secret',
      resourceId: secret.id,
      metadataJson: {
        key: secret.key,
        sourceEnvironmentId: secret.environmentId,
        targetEnvironmentIds: targetIdsWithoutSource,
        overwrite,
        created,
        updated,
        skipped,
      },
    });

    reply.send({ created, updated, skipped });
  });

  app.post('/environments/:id/secrets/copy-from', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: targetEnvId } = request.params as { id: string };
    const body = request.body as
      | { sourceEnvironmentId?: string; keys?: string[]; overwrite?: boolean }
      | undefined;

    const sourceEnvironmentId = body?.sourceEnvironmentId?.trim();
    if (!sourceEnvironmentId) {
      sendError(reply, 400, 'Source environment is required');
      return;
    }

    const targetEnv = await prisma.environment.findUnique({ where: { id: targetEnvId } });
    if (!targetEnv) {
      sendError(reply, 404, 'Target environment not found');
      return;
    }
    if (!requireEnvironmentScope(request, reply, targetEnvId)) {
      return;
    }

    const sourceEnv = await prisma.environment.findUnique({ where: { id: sourceEnvironmentId } });
    if (!sourceEnv) {
      sendError(reply, 404, 'Source environment not found');
      return;
    }
    if (!requireEnvironmentScope(request, reply, sourceEnvironmentId)) {
      return;
    }

    if (sourceEnv.projectId !== targetEnv.projectId) {
      sendError(reply, 400, 'Source and target must belong to the same project');
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      targetEnv.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const overwrite = body?.overwrite === true;
    const keys = body?.keys?.filter((key) => key.trim().length > 0);

    const sourceSecrets = await prisma.secret.findMany({
      where: {
        environmentId: sourceEnv.id,
        deletedAt: null,
        ...(keys?.length ? { key: { in: keys } } : {}),
      },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    if (sourceSecrets.length === 0) {
      const skippedDetails =
        keys?.length
          ? keys.map((key) => ({
              key,
              reason: 'Source environment does not contain this key.',
              code: 'SOURCE_MISSING',
            }))
          : [];
      reply.send({ created: [], updated: [], skipped: keys ?? [], skippedDetails });
      return;
    }

    const approvalRequestIds: string[] = [];
    for (const sourceSecret of sourceSecrets) {
      const rules = await findMatchingApprovalRules({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
      });
      if (rules.length === 0) {
        continue;
      }
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const version = sourceSecret.versions[0];
      const existing = await findPendingApprovalRequest({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
        secretId: sourceSecret.id,
        targetEnvironmentId: targetEnv.id,
      });
      if (existing) {
        approvalRequestIds.push(existing.id);
        continue;
      }
      const approval = await createApprovalRequest({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
        requestedBy: auth.user!.id,
        secretId: sourceSecret.id,
        targetEnvironmentId: targetEnv.id,
        expectedVersionId: version?.id,
        metadataJson: { sourceEnvironmentId: sourceEnv.id, overwrite },
      });
      approvalRequestIds.push(approval.id);
      await logAudit({
        projectId: targetEnv.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          action: 'COPY_FROM',
          key: sourceSecret.key,
          secretId: sourceSecret.id,
          targetEnvironmentId: targetEnv.id,
          sourceEnvironmentId: sourceEnv.id,
        },
      });
    }
    if (approvalRequestIds.length > 0) {
      reply.code(202).send({ status: 'pending', approvalRequestIds });
      return;
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const skippedDetails: { key: string; reason: string; code: string }[] = [];
    const keyVersion = masterKeyVersion();

    const requestedKeys = keys?.length ? new Set(keys) : null;
    if (requestedKeys) {
      const foundKeys = new Set(sourceSecrets.map((secret) => secret.key));
      for (const key of requestedKeys) {
        if (!foundKeys.has(key)) {
          skipped.push(key);
          skippedDetails.push({
            key,
            reason: 'Source environment does not contain this key.',
            code: 'SOURCE_MISSING',
          });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const sourceSecret of sourceSecrets) {
        const version = sourceSecret.versions[0];
        if (!version) {
          skipped.push(sourceSecret.key);
          skippedDetails.push({
            key: sourceSecret.key,
            reason: 'Source secret does not have an active version.',
            code: 'SOURCE_NO_VERSION',
          });
          continue;
        }

        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: { environmentId: targetEnv.id, key: sourceSecret.key },
          },
        });

        if (existing && !overwrite) {
          skipped.push(sourceSecret.key);
          if (existing.deletedAt) {
            skippedDetails.push({
              key: sourceSecret.key,
              reason: 'Key was deleted but is still reserved. Use overwrite to restore.',
              code: 'TARGET_SOFT_DELETED',
            });
          } else {
            skippedDetails.push({
              key: sourceSecret.key,
              reason: 'Target environment already has this key.',
              code: 'TARGET_EXISTS',
            });
          }
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const createdSecret = await tx.secret.create({
            data: { environmentId: targetEnv.id, key: sourceSecret.key },
          });
          targetSecretId = createdSecret.id;
          created.push(sourceSecret.key);
        } else {
          updated.push(sourceSecret.key);
        }

        const value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
        const payload = encryptSecret(value, masterKey);

        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
      }
    });

    await logAudit({
      projectId: targetEnv.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.copy.bulk',
      resourceType: 'secret',
      metadataJson: {
        sourceEnvironmentId: sourceEnv.id,
        targetEnvironmentId: targetEnv.id,
        overwrite,
        created,
        updated,
        skipped,
      },
    });

    reply.send({ created, updated, skipped, skippedDetails });
  });
}
