import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { encryptSecret, loadMasterKey, masterKeyVersion } from '../../crypto.js';
import { prisma } from '../../db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import { isPrismaUniqueError } from '../services/prismaErrors.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

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
      sendError(reply, 400, 'Key and value are required');
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      sendError(reply, 404, 'Environment not found');
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
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
      sendError(reply, 409, 'Key already exists in this environment');
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
          sendError(reply, 409, 'Key already exists in this environment');
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
      sendError(reply, 400, 'Entries are required');
      return;
    }
    if (entries.length > 500) {
      sendError(reply, 400, 'Too many entries (max 500).');
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      sendError(reply, 404, 'Environment not found');
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
        sendError(reply, 400, 'Each entry must include key and value');
        return;
      }
      deduped.set(key, value);
    }

    const keys = Array.from(deduped.keys());
    if (keys.length === 0) {
      sendError(reply, 400, 'Entries are required');
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
    for (const [key, value] of deduped.entries()) {
      const active = activeByKey.get(key);
      const existing = existingByKey.get(key);
      if (active && !overwrite) {
        skipped += 1;
        continue;
      }

      const isCreate = !existing;
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

    reply.send({ created, updated, skipped });
  });
}
