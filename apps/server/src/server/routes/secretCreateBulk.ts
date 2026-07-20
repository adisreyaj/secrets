import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { masterKeyVersion } from '../../crypto.js';
import {
  db,
  environments,
  isUniqueConstraintError,
  Role,
  secrets,
  secretVersions,
} from '../../db/index.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { normalizeIdentifier } from '../services/identifiers.js';
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

      const env = await db.query.environments.findFirst({
        where: eq(environments.id, envId),
      });
      if (!env) {
        sendError(reply, 404, 'Environment not found');
        return;
      }

      const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
      if (!role) {
        return;
      }

      const siblingSecrets = await db.query.secrets.findMany({
        where: and(eq(secrets.environmentId, envId), isNull(secrets.deletedAt)),
        columns: { id: true, key: true },
      });
      const hasConflict = siblingSecrets.some(
        (sibling) => normalizeIdentifier(sibling.key) === normalizeIdentifier(key),
      );
      if (hasConflict) {
        sendError(reply, 409, 'Key already exists in this environment');
        return;
      }

      const existing = await db.query.secrets.findFirst({
        where: and(eq(secrets.environmentId, envId), eq(secrets.key, key)),
      });

      let secretId = existing?.id;
      if (!secretId) {
        try {
          const [secret] = await db
            .insert(secrets)
            .values({
              environmentId: envId,
              key,
            })
            .returning();
          secretId = secret.id;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            sendError(reply, 409, 'Key already exists in this environment');
            return;
          }
          throw error;
        }
      }

      const dek = await withEnvironmentDek(envId, (d) => d);
      const payload = encryptSecretWithKey(value, dek, envId, key);
      const keyVersion = masterKeyVersion();

      await db.transaction(async (tx) => {
        await tx
          .update(secretVersions)
          .set({ isActive: false })
          .where(eq(secretVersions.secretId, secretId!));
        await tx.insert(secretVersions).values({
          secretId: secretId!,
          ciphertext: Buffer.from(payload.ciphertext),
          iv: Buffer.from(payload.iv),
          tag: Buffer.from(payload.tag),
          keyVersion,
          createdBy: auth.user?.id,
          isActive: true,
        });
        await tx
          .update(secrets)
          .set({ updatedAt: new Date(), deletedAt: null })
          .where(eq(secrets.id, secretId!));
      });

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

      const env = await db.query.environments.findFirst({
        where: eq(environments.id, envId),
      });
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

      const existingSecrets = await db.query.secrets.findMany({
        where: and(eq(secrets.environmentId, envId), inArray(secrets.key, keys)),
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
          const [secret] = await db
            .insert(secrets)
            .values({
              environmentId: envId,
              key,
            })
            .returning();
          secretId = secret.id;
        }

        await db.transaction(async (tx) => {
          await tx
            .update(secretVersions)
            .set({ isActive: false })
            .where(eq(secretVersions.secretId, secretId!));
          await tx.insert(secretVersions).values({
            secretId: secretId!,
            ciphertext: Buffer.from(payload.ciphertext),
            iv: Buffer.from(payload.iv),
            tag: Buffer.from(payload.tag),
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          });
          await tx
            .update(secrets)
            .set({ updatedAt: new Date(), deletedAt: null })
            .where(eq(secrets.id, secretId!));
        });

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
