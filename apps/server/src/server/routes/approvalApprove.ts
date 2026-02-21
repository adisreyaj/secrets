import {
  ApprovalAction,
  ApprovalStatus,
  AuthClientType,
  AuthIdentityProvider,
  Prisma,
  Role,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from '../../crypto.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

  app.post('/approvals/:id/approve', async (request, reply) => {
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

    const applied = await prisma.$transaction(async (tx) => {
      let resourceId: string | null = approval.secretId ?? null;
      let auditAction: string | null = null;
      let auditResourceType: string = 'secret';
      await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedBy: auth.user!.id,
          approvedAt: new Date(),
        },
      });

      const metadata = (approval.metadataJson as Record<string, unknown> | null) ?? null;
      if (metadata?.module === 'auth' && typeof metadata?.approvalKind === 'string') {
        const approvalKind = metadata.approvalKind;
        const asString = (value: unknown) =>
          typeof value === 'string' ? value.trim() : '';
        const asNumber = (value: unknown) =>
          typeof value === 'number' && Number.isFinite(value) ? value : undefined;
        const asBoolean = (value: unknown) =>
          typeof value === 'boolean' ? value : undefined;
        const asStringArray = (value: unknown) =>
          Array.isArray(value)
            ? value.filter((entry): entry is string => typeof entry === 'string')
            : undefined;

        if (approvalKind === 'config.update') {
          const updated = await tx.authProjectConfig.upsert({
            where: { projectId: approval.projectId },
            create: {
              projectId: approval.projectId,
              nativeAuthEnabled: asBoolean(metadata.nativeAuthEnabled) ?? true,
              emailPasswordEnabled: asBoolean(metadata.emailPasswordEnabled) ?? true,
              accessTokenTtlMinutes: asNumber(metadata.accessTokenTtlMinutes) ?? 15,
              refreshTokenTtlDays: asNumber(metadata.refreshTokenTtlDays) ?? 30,
            },
            update: {
              nativeAuthEnabled: asBoolean(metadata.nativeAuthEnabled),
              emailPasswordEnabled: asBoolean(metadata.emailPasswordEnabled),
              accessTokenTtlMinutes: asNumber(metadata.accessTokenTtlMinutes),
              refreshTokenTtlDays: asNumber(metadata.refreshTokenTtlDays),
            },
          });
          resourceId = updated.id;
          auditAction = 'auth.config.update';
          auditResourceType = 'auth_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'provider.upsert') {
          const provider = asString(metadata.provider).toUpperCase();
          const clientId = asString(metadata.clientId);
          const payloadCiphertext = approval.payloadCiphertext;
          const payloadIv = approval.payloadIv;
          const payloadTag = approval.payloadTag;
          if (
            (provider !== 'GOOGLE' && provider !== 'GITHUB') ||
            !clientId ||
            !payloadCiphertext ||
            !payloadIv ||
            !payloadTag
          ) {
            throw new Error('Invalid auth provider approval payload');
          }
          const providerConfig = await tx.authProviderConfig.upsert({
            where: {
              projectId_provider: {
                projectId: approval.projectId,
                provider: provider as AuthIdentityProvider,
              },
            },
            create: {
              projectId: approval.projectId,
              provider: provider as AuthIdentityProvider,
              enabled: asBoolean(metadata.enabled) ?? true,
              clientId,
              clientSecretCiphertext: payloadCiphertext,
              clientSecretIv: payloadIv,
              clientSecretTag: payloadTag,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
              scopesJson: asStringArray(metadata.scopes) ?? [],
            },
            update: {
              enabled: asBoolean(metadata.enabled) ?? undefined,
              clientId,
              clientSecretCiphertext: payloadCiphertext,
              clientSecretIv: payloadIv,
              clientSecretTag: payloadTag,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
              scopesJson: asStringArray(metadata.scopes) ?? undefined,
            },
          });
          resourceId = providerConfig.id;
          auditAction = 'auth.provider.upsert';
          auditResourceType = 'auth_provider_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'provider.update') {
          const providerId = asString(metadata.providerId);
          if (!providerId) {
            throw new Error('Missing providerId for approval');
          }
          const currentProvider = await tx.authProviderConfig.findUnique({
            where: { id: providerId },
          });
          if (!currentProvider || currentProvider.projectId !== approval.projectId) {
            throw new Error('Provider config not found');
          }
          const updated = await tx.authProviderConfig.update({
            where: { id: currentProvider.id },
            data: {
              enabled: asBoolean(metadata.enabled),
              clientId: asString(metadata.clientId) || undefined,
              scopesJson: asStringArray(metadata.scopes) ?? undefined,
            },
          });
          resourceId = updated.id;
          auditAction = 'auth.provider.update';
          auditResourceType = 'auth_provider_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'provider.rotate_secret') {
          const providerId = asString(metadata.providerId);
          const payloadCiphertext = approval.payloadCiphertext;
          const payloadIv = approval.payloadIv;
          const payloadTag = approval.payloadTag;
          if (!providerId || !payloadCiphertext || !payloadIv || !payloadTag) {
            throw new Error('Missing provider rotate payload');
          }
          const currentProvider = await tx.authProviderConfig.findUnique({
            where: { id: providerId },
          });
          if (!currentProvider || currentProvider.projectId !== approval.projectId) {
            throw new Error('Provider config not found');
          }
          const updated = await tx.authProviderConfig.update({
            where: { id: currentProvider.id },
            data: {
              clientSecretCiphertext: payloadCiphertext,
              clientSecretIv: payloadIv,
              clientSecretTag: payloadTag,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            },
          });
          resourceId = updated.id;
          auditAction = 'auth.provider.rotate_secret';
          auditResourceType = 'auth_provider_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'client.create') {
          const name = asString(metadata.name);
          const typeRaw = asString(metadata.type).toLowerCase();
          if (!name) {
            throw new Error('Missing client name for approval');
          }
          const type: AuthClientType =
            typeRaw === 'confidential' ? AuthClientType.CONFIDENTIAL : AuthClientType.PUBLIC;
          const redirectUris = asStringArray(metadata.redirectUris) ?? [];
          const clientId = `ac_${generateToken().slice(0, 24)}`;
          const rawSecret = type === AuthClientType.CONFIDENTIAL ? `acs_${generateToken()}` : null;
          const created = await tx.authClient.create({
            data: {
              projectId: approval.projectId,
              name,
              type,
              clientId,
              clientSecretHash: rawSecret ? hashToken(rawSecret) : null,
              redirectUrisJson: redirectUris,
            },
          });
          resourceId = created.id;
          auditAction = 'auth.client.create';
          auditResourceType = 'auth_client';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'client.update') {
          const clientRecordId = asString(metadata.clientId);
          if (!clientRecordId) {
            throw new Error('Missing clientId for approval');
          }
          const currentClient = await tx.authClient.findFirst({
            where: { id: clientRecordId, deletedAt: null },
          });
          if (!currentClient || currentClient.projectId !== approval.projectId) {
            throw new Error('Auth client not found');
          }
          const rotateSecret =
            asBoolean(metadata.rotateSecret) === true &&
            currentClient.type === AuthClientType.CONFIDENTIAL;
          const rawSecret = rotateSecret ? `acs_${generateToken()}` : null;
          const updated = await tx.authClient.update({
            where: { id: currentClient.id },
            data: {
              name: asString(metadata.name) || undefined,
              redirectUrisJson: asStringArray(metadata.redirectUris) ?? undefined,
              clientSecretHash: rawSecret ? hashToken(rawSecret) : undefined,
            },
          });
          resourceId = updated.id;
          auditAction = rotateSecret ? 'auth.client.rotate_secret' : 'auth.client.update';
          auditResourceType = 'auth_client';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'client.delete') {
          const clientRecordId = asString(metadata.clientId);
          if (!clientRecordId) {
            throw new Error('Missing clientId for approval');
          }
          const currentClient = await tx.authClient.findFirst({
            where: { id: clientRecordId, deletedAt: null },
          });
          if (!currentClient || currentClient.projectId !== approval.projectId) {
            throw new Error('Auth client not found');
          }
          await tx.authClient.update({
            where: { id: currentClient.id },
            data: { deletedAt: new Date() },
          });
          resourceId = currentClient.id;
          auditAction = 'auth.client.delete';
          auditResourceType = 'auth_client';
          return { resourceId, auditAction, auditResourceType };
        }
      }

      if (approval.action === ApprovalAction.CREATE) {
        const existing = await tx.secret.findMany({
          where: {
            environmentId: approval.environmentId,
            deletedAt: null,
          },
          select: { key: true },
        });
        const hasConflict = existing.some(
          (secret) => normalizeIdentifier(secret.key) === normalizeIdentifier(approval.key),
        );
        if (hasConflict) {
          throw new Error('Secret already exists');
        }
        if (!approval.payloadCiphertext || !approval.payloadIv || !approval.payloadTag) {
          throw new Error('Missing payload');
        }
        const secret = await tx.secret.create({
          data: {
            environmentId: approval.environmentId,
            key: approval.key,
          },
        });
        resourceId = secret.id;
        auditAction = 'secret.create';
        await tx.secretVersion.create({
          data: {
            secretId: secret.id,
            ciphertext: approval.payloadCiphertext,
            iv: approval.payloadIv,
            tag: approval.payloadTag,
            keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
      }

      if (approval.action === ApprovalAction.UPDATE) {
        if (!approval.secretId) {
          throw new Error('Missing secret');
        }
        const secret = await tx.secret.findUnique({
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
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        if (normalizeIdentifier(approval.key) !== normalizeIdentifier(secret.key)) {
          const siblings = await tx.secret.findMany({
            where: {
              environmentId: secret.environmentId,
              deletedAt: null,
            },
            select: { id: true, key: true },
          });
          const existing = siblings.find(
            (candidate) =>
              candidate.id !== secret.id &&
              normalizeIdentifier(candidate.key) === normalizeIdentifier(approval.key),
          );
          if (existing) {
            throw new Error('Key already exists in this environment');
          }
        }
        const payload = approval.payloadCiphertext
          ? {
              ciphertext: approval.payloadCiphertext,
              iv: approval.payloadIv!,
              tag: approval.payloadTag!,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            }
          : null;
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        if (payload) {
          updates.push(
            tx.secretVersion.updateMany({
              where: { secretId: secret.id },
              data: { isActive: false },
            }),
            tx.secretVersion.create({
              data: {
                secretId: secret.id,
                ciphertext: payload.ciphertext,
                iv: payload.iv,
                tag: payload.tag,
                keyVersion: payload.keyVersion,
                createdBy: auth.user?.id,
                isActive: true,
              },
            }),
          );
        }
        updates.push(
          tx.secret.update({
            where: { id: secret.id },
            data: { key: approval.key, updatedAt: new Date(), deletedAt: null },
          }),
        );
        for (const update of updates) {
          await update;
        }
        auditAction = 'secret.update';
      }

      if (approval.action === ApprovalAction.DELETE) {
        if (!approval.secretId) {
          throw new Error('Missing secret');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          where: { id: approval.secretId },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        await tx.secret.update({
          where: { id: secret.id },
          data: { deletedAt: new Date() },
        });
        auditAction = 'secret.delete';
      }

      if (approval.action === ApprovalAction.ROLLBACK) {
        if (!approval.secretId || !approval.expectedVersionId) {
          throw new Error('Missing rollback version');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: { where: { id: approval.expectedVersionId } },
          },
          where: { id: approval.secretId },
        });
        if (!secret || secret.versions.length === 0) {
          throw new Error('Secret not found');
        }
        await tx.secretVersion.updateMany({
          where: { secretId: secret.id },
          data: { isActive: false },
        });
        await tx.secretVersion.update({
          where: { id: approval.expectedVersionId },
          data: { isActive: true },
        });
        await tx.secret.update({
          where: { id: secret.id },
          data: { updatedAt: new Date(), deletedAt: null },
        });
        auditAction = 'secret.rollback';
      }

      if (approval.action === ApprovalAction.COPY || approval.action === ApprovalAction.COPY_FROM) {
        if (!approval.secretId || !approval.targetEnvironmentId) {
          throw new Error('Missing copy target');
        }
        const targetEnv = await tx.environment.findUnique({
          where: { id: approval.targetEnvironmentId },
        });
        if (!targetEnv || targetEnv.projectId !== approval.projectId) {
          throw new Error('Target environment not found');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            environment: true,
          },
          where: { id: approval.secretId },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        const value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
        const payload = encryptSecret(value, masterKey);
        const keyVersion = masterKeyVersion();
        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: {
              environmentId: approval.targetEnvironmentId,
              key: secret.key,
            },
          },
        });
        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const created = await tx.secret.create({
            data: {
              environmentId: approval.targetEnvironmentId,
              key: secret.key,
            },
          });
          targetSecretId = created.id;
        }
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
        resourceId = targetSecretId;
        auditAction = 'secret.copy';
      }

      return { resourceId, auditAction, auditResourceType };
    });

    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.approved',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    if (applied.auditAction) {
      await logAudit({
        projectId: approval.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: applied.auditAction,
        resourceType: applied.auditResourceType,
        resourceId: applied.resourceId,
        metadataJson: {
          requestedBy: approval.requestedBy,
          action: approval.action,
          key: approval.key,
          environmentId: approval.environmentId,
          targetEnvironmentId: approval.targetEnvironmentId ?? undefined,
        },
      });
    }

    reply.send({ ok: true });
  });
}
