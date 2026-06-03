import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { masterKeyVersion } from '../../crypto.js';
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
import { encryptSecretWithKey, withEnvironmentDek } from '../services/envCrypto.js';

const createSecretSchema = z.object({
  key: z.string().min(1, 'Key is required').trim(),
  value: z.string().max(100000, 'Secret value exceeds maximum length of 100KB'),
});

const createSecretBulkSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().min(1, 'Key is required').trim(),
        value: z.string().max(100000, 'Secret value exceeds maximum length of 100KB'),
      }),
    )
    .min(1, 'At least one entry is required')
    .max(500, 'Too many entries (max 500)'),
  overwrite: z.boolean().optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/environments/:id/secrets',
    {
      schema: {
        body: createSecretSchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: envId } = request.params as { id: string };
      const body = request.body as z.infer<typeof createSecretSchema>;
      const { key, value } = body;

      const env = await prisma.environment.findUnique({ where: { id: envId } });
      if (!env) {
        sendError(reply, 404, 'Environment not found');
        return;
      }

      const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
      if (!role) {
        return;
      }

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

      const dek = await withEnvironmentDek(envId, (d) => d);
      const payload = encryptSecretWithKey(value, dek, envId, key);
      const keyVersion = masterKeyVersion();

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
    },
  );

  app.post(
    '/environments/:id/secrets/bulk',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: createSecretBulkSchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: envId } = request.params as { id: string };
      const body = request.body as z.infer<typeof createSecretBulkSchema>;
      const { entries, overwrite } = body;

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
        deduped.set(entry.key, entry.value);
      }

      const keys = Array.from(deduped.keys());

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

      const dek = await withEnvironmentDek(envId, (d) => d);
      const keyVersion = masterKeyVersion();
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
        const payload = encryptSecretWithKey(value, dek, envId, key);

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
    },
  );
}
