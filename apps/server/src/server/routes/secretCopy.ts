import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, environments, Role, secrets, secretVersions } from '../../db/index.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';
import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  withEnvironmentDek,
} from '../services/envCrypto.js';
import {
  getActiveVersionsBySecretId,
  SECRET_ENVIRONMENT_COLUMNS,
} from '../services/secretQueries.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const activeVersion = (await getActiveVersionsBySecretId([secret.id])).get(secret.id);
    if (!activeVersion) {
      sendError(reply, 400, 'Secret has no active version');
      return;
    }

    const targetIdsWithoutSource = targetIds.filter((id) => id !== secret.environmentId);
    if (targetIdsWithoutSource.length === 0) {
      sendError(reply, 400, 'No target environments provided');
      return;
    }

    const targetEnvs = await db.query.environments.findMany({
      where: inArray(environments.id, targetIdsWithoutSource),
    });
    if (targetEnvs.length !== targetIdsWithoutSource.length) {
      sendError(reply, 404, 'One or more environments not found');
      return;
    }

    if (targetEnvs.some((env) => env.projectId !== secret.environment.projectId)) {
      sendError(reply, 400, 'Targets must belong to the same project');
      return;
    }

    const sourceDek = await withEnvironmentDek(secret.environmentId, (d) => d);
    const value = decryptSecretWithKey(
      { ciphertext: activeVersion.ciphertext, iv: activeVersion.iv, tag: activeVersion.tag },
      sourceDek,
      secret.environmentId,
      secret.key,
    );
    const overwrite = body?.overwrite === true;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    await db.transaction(async (tx) => {
      for (const env of targetEnvs) {
        const targetDek = await withEnvironmentDek(env.id, (d) => d);
        const existing = await tx.query.secrets.findFirst({
          where: and(eq(secrets.environmentId, env.id), eq(secrets.key, secret.key)),
        });

        if (existing && !overwrite) {
          skipped.push(env.id);
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const [createdSecret] = await tx
            .insert(secrets)
            .values({ environmentId: env.id, key: secret.key })
            .returning();
          targetSecretId = createdSecret.id;
          created.push(env.id);
        } else {
          updated.push(env.id);
        }

        const payload = encryptSecretWithKey(value, targetDek, env.id, secret.key);

        await tx
          .update(secretVersions)
          .set({ isActive: false })
          .where(eq(secretVersions.secretId, targetSecretId));
        await tx.insert(secretVersions).values({
          secretId: targetSecretId,
          ciphertext: Buffer.from(payload.ciphertext),
          iv: Buffer.from(payload.iv),
          tag: Buffer.from(payload.tag),
          keyVersion: activeVersion.keyVersion,
          createdBy: auth.user?.id,
          isActive: true,
        });
        await tx
          .update(secrets)
          .set({ updatedAt: new Date(), deletedAt: null })
          .where(eq(secrets.id, targetSecretId));
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

    const targetEnv = await db.query.environments.findFirst({
      where: eq(environments.id, targetEnvId),
    });
    if (!targetEnv) {
      sendError(reply, 404, 'Target environment not found');
      return;
    }
    if (!requireEnvironmentScope(request, reply, targetEnvId)) {
      return;
    }

    const sourceEnv = await db.query.environments.findFirst({
      where: eq(environments.id, sourceEnvironmentId),
    });
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

    const sourceSecrets = await db.query.secrets.findMany({
      where: and(
        eq(secrets.environmentId, sourceEnv.id),
        isNull(secrets.deletedAt),
        keys?.length ? inArray(secrets.key, keys) : undefined,
      ),
      orderBy: [asc(secrets.key)],
    });
    const versionsBySecretId = await getActiveVersionsBySecretId(sourceSecrets.map((s) => s.id));

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

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const skippedDetails: { key: string; reason: string; code: string }[] = [];

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

    const sourceDek = await withEnvironmentDek(sourceEnv.id, (d) => d);

    await db.transaction(async (tx) => {
      for (const sourceSecret of sourceSecrets) {
        const version = versionsBySecretId.get(sourceSecret.id);
        if (!version) {
          skipped.push(sourceSecret.key);
          skippedDetails.push({
            key: sourceSecret.key,
            reason: 'Source secret does not have an active version.',
            code: 'SOURCE_NO_VERSION',
          });
          continue;
        }

        const existing = await tx.query.secrets.findFirst({
          where: and(
            eq(secrets.environmentId, targetEnv.id),
            eq(secrets.key, sourceSecret.key),
          ),
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

        const targetDek = await withEnvironmentDek(targetEnv.id, (d) => d);

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const [createdSecret] = await tx
            .insert(secrets)
            .values({ environmentId: targetEnv.id, key: sourceSecret.key })
            .returning();
          targetSecretId = createdSecret.id;
          created.push(sourceSecret.key);
        } else {
          updated.push(sourceSecret.key);
        }

        const value = decryptSecretWithKey(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          sourceDek,
          sourceEnv.id,
          sourceSecret.key,
        );
        const payload = encryptSecretWithKey(value, targetDek, targetEnv.id, sourceSecret.key);

        await tx
          .update(secretVersions)
          .set({ isActive: false })
          .where(eq(secretVersions.secretId, targetSecretId));
        await tx.insert(secretVersions).values({
          secretId: targetSecretId,
          ciphertext: Buffer.from(payload.ciphertext),
          iv: Buffer.from(payload.iv),
          tag: Buffer.from(payload.tag),
          keyVersion: version.keyVersion,
          createdBy: auth.user?.id,
          isActive: true,
        });
        await tx
          .update(secrets)
          .set({ updatedAt: new Date(), deletedAt: null })
          .where(eq(secrets.id, targetSecretId));
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
