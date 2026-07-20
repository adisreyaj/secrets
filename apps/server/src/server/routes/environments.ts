import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  db,
  environments,
  featureFlagEnvironmentConfigs,
  featureFlags,
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
import { toEnvironmentDto } from '../mappers/projects.js';
import { deleteEnvironmentWithGuards } from '../services/deletions.js';
import { logAudit } from '../services/audit.js';
import { ensureUniqueEnvironmentSlug } from '../services/slugs.js';
import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  withEnvironmentDek,
} from '../services/envCrypto.js';
import { getActiveVersionsBySecretId } from '../services/secretQueries.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.tokenScopeType === 'service_account') {
      sendError(reply, 403, 'Service account tokens cannot create environments');
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const body = request.body as { name?: string; copyFromEnvironmentId?: string | null } | undefined;
    if (!body?.name) {
      sendError(reply, 400, 'Name is required');
      return;
    }

    const copyFromId = body.copyFromEnvironmentId?.trim();
    let sourceEnv: { id: string; projectId: string } | null = null;
    if (copyFromId) {
      sourceEnv =
        (await db.query.environments.findFirst({
          where: and(eq(environments.id, copyFromId), eq(environments.projectId, projectId)),
          columns: { id: true, projectId: true },
        })) ?? null;
      if (!sourceEnv) {
        sendError(reply, 400, 'Source environment not found');
        return;
      }
    }

    const slug = await ensureUniqueEnvironmentSlug(projectId, body.name);
    let env;
    try {
      const [created] = await db
        .insert(environments)
        .values({
          projectId,
          name: body.name,
          slug,
        })
        .returning();
      env = created;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(reply, 409, 'Environment name already exists in this project');
        return;
      }
      throw error;
    }

    await withEnvironmentDek(env.id, () => undefined);

    let copiedCount = 0;
    if (sourceEnv) {
      const sourceDek = await withEnvironmentDek(sourceEnv.id, (dek) => dek);
      const targetDek = await withEnvironmentDek(env.id, (dek) => dek);
      const sourceSecrets = await db.query.secrets.findMany({
        where: and(eq(secrets.environmentId, sourceEnv.id), isNull(secrets.deletedAt)),
        orderBy: [asc(secrets.key)],
      });
      const versionsBySecretId = await getActiveVersionsBySecretId(
        sourceSecrets.map((s) => s.id),
      );

      if (sourceSecrets.length > 0) {
        await db.transaction(async (tx) => {
          for (const secret of sourceSecrets) {
            const version = versionsBySecretId.get(secret.id);
            if (!version) {
              await tx.insert(secrets).values({
                environmentId: env.id,
                key: secret.key,
              });
              continue;
            }

            const value = decryptSecretWithKey(
              { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
              sourceDek,
              sourceEnv.id,
              secret.key,
            );
            const payload = encryptSecretWithKey(value, targetDek, env.id, secret.key);

            const [createdSecret] = await tx
              .insert(secrets)
              .values({
                environmentId: env.id,
                key: secret.key,
              })
              .returning();

            await tx.insert(secretVersions).values({
              secretId: createdSecret.id,
              ciphertext: Buffer.from(payload.ciphertext),
              iv: Buffer.from(payload.iv),
              tag: Buffer.from(payload.tag),
              keyVersion: version.keyVersion,
              createdBy: auth.user?.id,
              isActive: true,
            });
          }
        });
        copiedCount = sourceSecrets.length;
      }
    }

    const flags = await db.query.featureFlags.findMany({
      where: and(eq(featureFlags.projectId, projectId), isNull(featureFlags.deletedAt)),
      with: {
        environmentConfigs: {
          with: {
            environment: {
              columns: { id: true, createdAt: true },
            },
          },
        },
      },
      orderBy: [asc(featureFlags.createdAt)],
    });

    if (flags.length > 0) {
      await db.transaction(async (tx) => {
        for (const flag of flags) {
          const sortedConfigs = flag.environmentConfigs
            .filter((config) => config.environmentId !== env.id)
            .slice()
            .sort(
              (a, b) =>
                a.environment.createdAt.getTime() - b.environment.createdAt.getTime(),
            );
          const baseline = sortedConfigs[0];
          if (!baseline) {
            continue;
          }

          await tx
            .insert(featureFlagEnvironmentConfigs)
            .values({
              flagId: flag.id,
              environmentId: env.id,
              enabled: baseline.enabled,
              valueType: baseline.valueType,
              booleanValue: baseline.booleanValue,
              jsonValue: baseline.jsonValue ?? null,
              runtime: baseline.runtime,
              labelsJson: baseline.labelsJson ?? null,
            })
            .onConflictDoUpdate({
              target: [
                featureFlagEnvironmentConfigs.flagId,
                featureFlagEnvironmentConfigs.environmentId,
              ],
              set: {
                enabled: baseline.enabled,
                valueType: baseline.valueType,
                booleanValue: baseline.booleanValue,
                jsonValue: baseline.jsonValue ?? null,
                runtime: baseline.runtime,
                labelsJson: baseline.labelsJson ?? null,
              },
            });
        }
      });
    }

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'environment.create',
      resourceType: 'environment',
      resourceId: env.id,
      metadataJson: sourceEnv
        ? {
            copyFromEnvironmentId: sourceEnv.id,
            copiedSecrets: copiedCount,
            seededFlags: flags.length,
          }
        : { seededFlags: flags.length },
    });

    reply.code(201).send(toEnvironmentDto(env));
  });

  app.get(
    '/projects/:id/environments',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: projectId } = request.params as { id: string };
      const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
      if (!role) {
        return;
      }

      const query = request.query as { limit: number; cursor?: string };
      const limit = query.limit;
      const cursor = query.cursor;
      const scopedEnvIds = request.auth?.scopeEnvironmentIds;

      const all = await db.query.environments.findMany({
        where: and(
          eq(environments.projectId, projectId),
          request.auth?.viaToken && scopedEnvIds
            ? inArray(environments.id, scopedEnvIds)
            : undefined,
        ),
        orderBy: [desc(environments.createdAt)],
      });

      let start = 0;
      if (cursor) {
        const idx = all.findIndex((e) => e.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = all.slice(start, start + limit + 1);

      let nextCursor: string | undefined = undefined;
      if (page.length > limit) {
        const nextItem = page.pop();
        nextCursor = nextItem?.id;
      }

      reply.send({
        data: page.map(toEnvironmentDto),
        nextCursor,
      });
    },
  );

  app.get('/projects/:id/environments/slug/:slug', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, slug } = request.params as { id: string; slug: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const env = await db.query.environments.findFirst({
      where: and(eq(environments.projectId, projectId), eq(environments.slug, slug)),
    });

    if (!env) {
      sendError(reply, 404, 'Environment not found');
      return;
    }
    if (!requireEnvironmentScope(request, reply, env.id)) {
      return;
    }

    reply.send(toEnvironmentDto(env));
  });

  app.delete('/projects/:id/environments/:environmentId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, environmentId } = request.params as {
      id: string;
      environmentId: string;
    };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | { confirmText?: string; forceLastEnvironment?: boolean }
      | undefined;
    if (!body?.confirmText?.trim()) {
      sendError(reply, 400, 'confirmText is required');
      return;
    }

    const result = await deleteEnvironmentWithGuards({
      projectId,
      environmentId,
      confirmText: body.confirmText,
      forceLastEnvironment: body.forceLastEnvironment === true,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
    });

    if (!result.ok) {
      sendError(reply, result.status, result.error);
      return;
    }

    reply.send({ ok: true });
  });
}
