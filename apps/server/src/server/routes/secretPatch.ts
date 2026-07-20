import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { masterKeyVersion } from '../../crypto.js';
import { db, Role, secrets, secretVersions } from '../../db/index.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import { logAudit } from '../services/audit.js';
import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  withEnvironmentDek,
} from '../services/envCrypto.js';
import { SECRET_ENVIRONMENT_COLUMNS } from '../services/secretQueries.js';

const patchSecretParamsSchema = z.object({
  id: z.string().min(1, 'Invalid secret ID'),
});

const patchSecretBodySchema = z
  .object({
    key: z.string().min(1, 'Key cannot be empty').trim().optional(),
    value: z.string().optional(),
  })
  .refine((data) => data.key !== undefined || data.value !== undefined, {
    message: 'Key or value is required',
  });

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.patch(
    '/secrets/:id',
    {
      schema: {
        params: patchSecretParamsSchema,
        body: patchSecretBodySchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const params = request.params as z.infer<typeof patchSecretParamsSchema>;
      const body = request.body as z.infer<typeof patchSecretBodySchema>;
      const { id: secretId } = params;
      const nextKey = body.key;
      const nextValue = body.value;

      const secret = await db.query.secrets.findFirst({
        where: eq(secrets.id, secretId),
        with: {
          environment: { columns: SECRET_ENVIRONMENT_COLUMNS },
        },
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

      const keyChanged = nextKey && nextKey !== secret.key;
      const normalizedKeyChanged =
        nextKey && normalizeIdentifier(nextKey) !== normalizeIdentifier(secret.key);
      if (normalizedKeyChanged && nextKey) {
        const siblings = await db.query.secrets.findMany({
          where: and(eq(secrets.environmentId, secret.environmentId), isNull(secrets.deletedAt)),
          columns: { id: true, key: true },
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

      const valueChanged = body.value !== undefined;
      const finalKey = nextKey ?? secret.key;

      const dek = await withEnvironmentDek(secret.environmentId, (d) => d);
      const keyVersion = masterKeyVersion();

      await db.transaction(async (tx) => {
        if (keyChanged && nextKey) {
          const allVersions = await tx.query.secretVersions.findMany({
            where: eq(secretVersions.secretId, secretId),
            orderBy: [desc(secretVersions.createdAt)],
          });
          for (const version of allVersions) {
            const plaintext = decryptSecretWithKey(
              { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
              dek,
              secret.environmentId,
              secret.key,
            );
            const rewritten = encryptSecretWithKey(
              plaintext,
              dek,
              secret.environmentId,
              nextKey,
            );
            await tx
              .update(secretVersions)
              .set({
                ciphertext: Buffer.from(rewritten.ciphertext),
                iv: Buffer.from(rewritten.iv),
                tag: Buffer.from(rewritten.tag),
              })
              .where(eq(secretVersions.id, version.id));
          }
        }

        if (valueChanged && nextValue !== undefined) {
          const payload = encryptSecretWithKey(nextValue, dek, secret.environmentId, finalKey);
          await tx
            .update(secretVersions)
            .set({ isActive: false })
            .where(eq(secretVersions.secretId, secretId));
          await tx.insert(secretVersions).values({
            secretId,
            ciphertext: Buffer.from(payload.ciphertext),
            iv: Buffer.from(payload.iv),
            tag: Buffer.from(payload.tag),
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          });
        }

        await tx
          .update(secrets)
          .set({
            ...(keyChanged && nextKey ? { key: nextKey } : {}),
            updatedAt: new Date(),
            deletedAt: null,
          })
          .where(eq(secrets.id, secretId));
      });

      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'secret.update',
        resourceType: 'secret',
        resourceId: secretId,
        metadataJson: {
          previousKey: secret.key,
          updatedKey: finalKey,
          updatedValue: valueChanged,
        },
      });

      reply.send({ ok: true });
    },
  );
}
