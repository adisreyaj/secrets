import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  ApprovalAction,
  Role,
} from '@prisma/client';
import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from './crypto.js';
import { prisma } from './db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
  requireUserForApproval,
} from './server/auth/guards.js';
import { toUserDto } from './server/mappers/users.js';
import { findMatchingApprovalRules, findPendingApprovalRequest, createApprovalRequest } from './server/services/approvals.js';
import { logAudit } from './server/services/audit.js';
import { registerCoreHttpMiddleware } from './server/http/middleware.js';
import { registerRoutes as registerAuthRoutes } from './server/routes/auth.js';
import { registerRoutes as registerApiTokenRoutes } from './server/routes/apiTokens.js';
import { registerRoutes as registerAuditRoutes } from './server/routes/audit.js';
import { registerRoutes as registerApprovalApproveRoutes } from './server/routes/approvalApprove.js';
import { registerRoutes as registerApprovalRuleRoutes } from './server/routes/approvalRules.js';
import { registerRoutes as registerApprovalRequestRoutes } from './server/routes/approvalRequests.js';
import { registerRoutes as registerExportRoutes } from './server/routes/exports.js';
import { registerRoutes as registerEnvironmentRoutes } from './server/routes/environments.js';
import { registerRoutes as registerFlagRoutes } from './server/routes/flags.js';
import { registerRoutes as registerFlagRuntimeRoutes } from './server/routes/flagsRuntime.js';
import { registerRoutes as registerRuntimeAuthRoutes } from './server/routes/runtimeAuth.js';
import { registerRoutes as registerProjectSettingsRoutes } from './server/routes/projectSettings.js';
import { registerRoutes as registerProjectMemberRoutes } from './server/routes/projectMembers.js';
import { registerRoutes as registerProjectCoreRoutes } from './server/routes/projectCore.js';
import { registerRoutes as registerOrganizationRoutes } from './server/routes/organizations.js';
import { registerRoutes as registerSecretReadRoutes } from './server/routes/secretReads.js';
import { registerRoutes as registerServiceAccountRoutes } from './server/routes/serviceAccounts.js';
import { normalizeIdentifier } from './server/services/identifiers.js';
import { isPrismaUniqueError } from './server/services/prismaErrors.js';
import { createLogDispatcher } from './server/logging/dispatcher.js';
import './types.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.logFormat === 'pretty'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true },
            },
          }
        : true,
    disableRequestLogging: true,
  });
  const logDispatcher = await createLogDispatcher(app.log, {
    service: 'server',
    env: config.env,
  });
  const masterKey = loadMasterKey();

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.appOrigins.includes(origin.replace(/\/$/, '')));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });
  registerCoreHttpMiddleware(app, logDispatcher);

  app.get('/health', async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerApprovalApproveRoutes(app);
  await registerApprovalRuleRoutes(app);
  await registerApprovalRequestRoutes(app);
  await registerApiTokenRoutes(app);
  await registerAuditRoutes(app);
  await registerEnvironmentRoutes(app);
  await registerExportRoutes(app);
  await registerFlagRoutes(app);
  await registerFlagRuntimeRoutes(app);
  await registerRuntimeAuthRoutes(app);
  await registerProjectCoreRoutes(app);
  await registerProjectSettingsRoutes(app);
  await registerProjectMemberRoutes(app);
  await registerOrganizationRoutes(app);
  await registerSecretReadRoutes(app);
  await registerServiceAccountRoutes(app);

  app.post('/environments/:id/secrets', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string } | undefined;
    const key = body?.key?.trim();
    const value = body?.value;
    if (!key || value === undefined) {
      reply.code(400).send({ error: 'Key and value are required' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const matchingRules = await findMatchingApprovalRules({
      projectId: env.projectId,
      environmentId: envId,
      action: ApprovalAction.CREATE,
      key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: env.projectId,
        environmentId: envId,
        action: ApprovalAction.CREATE,
        key,
        secretId: null,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const payload = encryptSecret(value, masterKey);
      const keyVersion = masterKeyVersion();
      const approval = await createApprovalRequest({
        projectId: env.projectId,
        environmentId: envId,
        action: ApprovalAction.CREATE,
        key,
        requestedBy: auth.user!.id,
        payload: { ...payload, keyVersion },
      });
      await logAudit({
        projectId: env.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'CREATE', key, environmentId: envId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    const payload = encryptSecret(value, masterKey);
    const keyVersion = masterKeyVersion();

    const siblingSecrets = await prisma.secret.findMany({
      where: { environmentId: envId, deletedAt: null },
      select: { id: true, key: true },
    });
    const hasConflict = siblingSecrets.some(
      (sibling) => normalizeIdentifier(sibling.key) === normalizeIdentifier(key),
    );
    if (hasConflict) {
      reply.code(409).send({ error: 'Key already exists in this environment' });
      return;
    }

    const existing = await prisma.secret.findUnique({
      where: { environmentId_key: { environmentId: envId, key } },
    });

    let secretId = existing?.id;
    if (!secretId) {
      try {
        const secret = await prisma.secret.create({
          data: {
            environmentId: envId,
            key,
          },
        });
        secretId = secret.id;
      } catch (error) {
        if (isPrismaUniqueError(error)) {
          reply.code(409).send({ error: 'Key already exists in this environment' });
          return;
        }
        throw error;
      }
    }

    await prisma.$transaction([
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
      prisma.secret.update({
        where: { id: secretId },
        data: { updatedAt: new Date(), deletedAt: null },
      }),
    ]);

    await logAudit({
      projectId: env.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.create',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: { key, environmentId: envId },
    });

    reply.code(201).send({ id: secretId });
  });

  app.post('/environments/:id/secrets/bulk', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const body = request.body as
      | { entries?: { key?: string; value?: string }[]; overwrite?: boolean }
      | undefined;

    const entries = body?.entries ?? [];
    if (entries.length === 0) {
      reply.code(400).send({ error: 'Entries are required' });
      return;
    }
    if (entries.length > 500) {
      reply.code(400).send({ error: 'Too many entries (max 500).' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, envId)) {
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const deduped = new Map<string, string>();
    for (const entry of entries) {
      const key = typeof entry.key === 'string' ? entry.key.trim() : '';
      const value = typeof entry.value === 'string' ? entry.value : undefined;
      if (!key || value === undefined) {
        reply.code(400).send({ error: 'Each entry must include key and value' });
        return;
      }
      deduped.set(key, value);
    }

    const keys = Array.from(deduped.keys());
    if (keys.length === 0) {
      reply.code(400).send({ error: 'Entries are required' });
      return;
    }

    const existingSecrets = await prisma.secret.findMany({
      where: { environmentId: envId, key: { in: keys } },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const existingByKey = new Map(existingSecrets.map((secret) => [secret.key, secret]));
    const activeByKey = new Map(
      existingSecrets
        .filter((secret) => secret.deletedAt === null)
        .map((secret) => [secret.key, secret]),
    );

    const overwrite = Boolean(body?.overwrite);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let pending = 0;
    const approvalRequestIds: string[] = [];

    for (const [key, value] of deduped.entries()) {
      const active = activeByKey.get(key);
      const existing = existingByKey.get(key);
      if (active && !overwrite) {
        skipped += 1;
        continue;
      }

      const isCreate = !existing;
      const action = isCreate ? ApprovalAction.CREATE : ApprovalAction.UPDATE;

      const matchingRules = await findMatchingApprovalRules({
        projectId: env.projectId,
        environmentId: envId,
        action,
        key,
      });
      if (matchingRules.length > 0) {
        if (!requireUserForApproval(request, reply)) {
          return;
        }
        const existingApproval = await findPendingApprovalRequest({
          projectId: env.projectId,
          environmentId: envId,
          action,
          key,
          secretId: isCreate ? null : existing?.id ?? null,
        });
        if (existingApproval) {
          pending += 1;
          approvalRequestIds.push(existingApproval.id);
          continue;
        }
        const encrypted = encryptSecret(value, masterKey);
        const keyVersion = masterKeyVersion();
        const approval = await createApprovalRequest({
          projectId: env.projectId,
          environmentId: envId,
          action,
          key,
          requestedBy: auth.user!.id,
          secretId: isCreate ? undefined : existing?.id,
          expectedVersionId: isCreate ? undefined : existing?.versions[0]?.id,
          payload: { ...encrypted, keyVersion },
        });
        await logAudit({
          projectId: env.projectId,
          actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
          action: 'approval.requested',
          resourceType: 'approval_request',
          resourceId: approval.id,
          metadataJson: {
            action: action === ApprovalAction.CREATE ? 'CREATE' : 'UPDATE',
            key,
            environmentId: envId,
            secretId: existing?.id,
          },
        });
        pending += 1;
        approvalRequestIds.push(approval.id);
        continue;
      }

      const payload = encryptSecret(value, masterKey);
      const keyVersion = masterKeyVersion();

      let secretId = existing?.id;
      if (!secretId) {
        const secret = await prisma.secret.create({
          data: {
            environmentId: envId,
            key,
          },
        });
        secretId = secret.id;
      }

      await prisma.$transaction([
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
        prisma.secret.update({
          where: { id: secretId },
          data: { updatedAt: new Date(), deletedAt: null },
        }),
      ]);

      await logAudit({
        projectId: env.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: isCreate ? 'secret.create' : 'secret.update',
        resourceType: 'secret',
        resourceId: secretId,
        metadataJson: { key, environmentId: envId },
      });

      if (isCreate) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    reply.send({ created, updated, skipped, pending, approvalRequestIds });
  });

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
      reply.code(400).send({ error: 'Key or value is required' });
      return;
    }
    if (nextKeyRaw !== undefined && !nextKey) {
      reply.code(400).send({ error: 'Key is required' });
      return;
    }
    if (nextValueRaw !== undefined && !nextValue) {
      reply.code(400).send({ error: 'Value is required' });
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
      reply.code(404).send({ error: 'Secret not found' });
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
        reply.code(409).send({ error: 'Key already exists in this environment' });
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
      reply.code(400).send({ error: 'Target environments are required' });
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
      reply.code(404).send({ error: 'Secret not found' });
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
      reply.code(400).send({ error: 'Secret has no active version' });
      return;
    }

    const targetIdsWithoutSource = targetIds.filter((id) => id !== secret.environmentId);
    if (targetIdsWithoutSource.length === 0) {
      reply.code(400).send({ error: 'No target environments provided' });
      return;
    }

    const targetEnvs = await prisma.environment.findMany({
      where: { id: { in: targetIdsWithoutSource } },
    });
    if (targetEnvs.length !== targetIdsWithoutSource.length) {
      reply.code(404).send({ error: 'One or more environments not found' });
      return;
    }

    if (targetEnvs.some((env) => env.projectId !== secret.environment.projectId)) {
      reply.code(400).send({ error: 'Targets must belong to the same project' });
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
      reply.code(400).send({ error: 'Source environment is required' });
      return;
    }

    const targetEnv = await prisma.environment.findUnique({ where: { id: targetEnvId } });
    if (!targetEnv) {
      reply.code(404).send({ error: 'Target environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, targetEnvId)) {
      return;
    }

    const sourceEnv = await prisma.environment.findUnique({ where: { id: sourceEnvironmentId } });
    if (!sourceEnv) {
      reply.code(404).send({ error: 'Source environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, sourceEnvironmentId)) {
      return;
    }

    if (sourceEnv.projectId !== targetEnv.projectId) {
      reply.code(400).send({ error: 'Source and target must belong to the same project' });
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
      reply.code(404).send({ error: 'Secret not found' });
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
      reply.code(400).send({ error: 'No previous version to rollback' });
      return;
    }

    const target = body?.versionId ? versions.find((v) => v.id === body.versionId) : versions[1];

    if (!target) {
      reply.code(404).send({ error: 'Version not found' });
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
      reply.code(404).send({ error: 'Secret not found' });
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

  let auditCleanupRunning = false;
  const runAuditRetentionCleanup = async () => {
    if (auditCleanupRunning) {
      return;
    }
    auditCleanupRunning = true;
    try {
      const projects = await prisma.project.findMany({
        where: { auditRetentionDays: { not: null } },
        select: { id: true, auditRetentionDays: true },
      });

      const now = new Date();
      for (const project of projects) {
        if (project.auditRetentionDays === null) continue;
        const cutoff = new Date(
          now.getTime() - project.auditRetentionDays * 24 * 60 * 60 * 1000,
        );
        const result = await prisma.auditLog.deleteMany({
          where: { projectId: project.id, createdAt: { lt: cutoff } },
        });
        if (result.count > 0) {
          app.log.info(
            {
              projectId: project.id,
              deleted: result.count,
              cutoff: cutoff.toISOString(),
            },
            'audit retention cleanup',
          );
        }
      }
    } catch (error) {
      await logDispatcher.emit({
        event: 'audit.cleanup.failed',
        level: 'error',
        category: 'internal',
        message: 'audit retention cleanup failed',
        err: error,
      });
    } finally {
      auditCleanupRunning = false;
    }
  };

  setTimeout(() => {
    void runAuditRetentionCleanup();
  }, 60 * 1000);
  setInterval(() => {
    void runAuditRetentionCleanup();
  }, 24 * 60 * 60 * 1000);

  return app;
}
