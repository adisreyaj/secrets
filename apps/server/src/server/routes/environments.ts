import { Prisma, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from '../../crypto.js';
import { prisma } from '../../db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { toEnvironmentDto } from '../mappers/projects.js';
import { deleteEnvironmentWithGuards } from '../services/deletions.js';
import { isPrismaUniqueError } from '../services/prismaErrors.js';
import { logAudit } from '../services/audit.js';
import { ensureUniqueEnvironmentSlug } from '../services/slugs.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

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
      sourceEnv = await prisma.environment.findFirst({
        where: { id: copyFromId, projectId },
        select: { id: true, projectId: true },
      });
      if (!sourceEnv) {
        sendError(reply, 400, 'Source environment not found');
        return;
      }
    }

    const slug = await ensureUniqueEnvironmentSlug(projectId, body.name);
    let env;
    try {
      env = await prisma.environment.create({
        data: {
          projectId,
          name: body.name,
          slug,
        },
      });
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        sendError(reply, 409, 'Environment name already exists in this project');
        return;
      }
      throw error;
    }

    let copiedCount = 0;
    if (sourceEnv) {
      const secrets = await prisma.secret.findMany({
        where: { environmentId: sourceEnv.id, deletedAt: null },
        include: {
          versions: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { key: 'asc' },
      });

      if (secrets.length > 0) {
        const operations: Prisma.PrismaPromise<unknown>[] = [];
        for (const secret of secrets) {
          const version = secret.versions[0];
          if (!version) {
            operations.push(
              prisma.secret.create({
                data: {
                  environmentId: env.id,
                  key: secret.key,
                },
              }),
            );
            continue;
          }

          const value = decryptSecret(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            masterKey,
          );
          const payload = encryptSecret(value, masterKey);
          const keyVersion = masterKeyVersion();

          operations.push(
            prisma.secret.create({
              data: {
                environmentId: env.id,
                key: secret.key,
                versions: {
                  create: {
                    ciphertext: payload.ciphertext,
                    iv: payload.iv,
                    tag: payload.tag,
                    keyVersion,
                    createdBy: auth.user?.id,
                    isActive: true,
                  },
                },
              },
            }),
          );
        }

        await prisma.$transaction(operations);
        copiedCount = secrets.length;
      }
    }

    // Keep feature-flag behavior consistent: new environments inherit baseline config
    // for all existing project flags.
    const flags = await prisma.featureFlag.findMany({
      where: { projectId, deletedAt: null },
      include: {
        environmentConfigs: {
          include: {
            variants: true,
            environment: {
              select: { id: true, createdAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (flags.length > 0) {
      await prisma.$transaction(async (tx) => {
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

          const createdConfig = await tx.featureFlagEnvironmentConfig.upsert({
            where: {
              flagId_environmentId: {
                flagId: flag.id,
                environmentId: env.id,
              },
            },
            create: {
              flagId: flag.id,
              environmentId: env.id,
              enabled: baseline.enabled,
              valueType: baseline.valueType,
              booleanValue: baseline.booleanValue,
              runtime: baseline.runtime,
              labelsJson:
                (baseline.labelsJson as Prisma.InputJsonValue | null) ??
                Prisma.JsonNull,
              defaultVariantKey: baseline.defaultVariantKey,
            },
            update: {
              enabled: baseline.enabled,
              valueType: baseline.valueType,
              booleanValue: baseline.booleanValue,
              runtime: baseline.runtime,
              labelsJson:
                (baseline.labelsJson as Prisma.InputJsonValue | null) ??
                Prisma.JsonNull,
              defaultVariantKey: baseline.defaultVariantKey,
            },
          });

          await tx.featureFlagEnvironmentVariant.deleteMany({
            where: { environmentConfigId: createdConfig.id },
          });
          if (baseline.variants.length > 0) {
            await tx.featureFlagEnvironmentVariant.createMany({
              data: baseline.variants.map((variant) => ({
                environmentConfigId: createdConfig.id,
                key: variant.key,
                valueType: variant.valueType,
                value: variant.value,
                orderIndex: variant.orderIndex,
              })),
            });
          }
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
        ? { copyFromEnvironmentId: sourceEnv.id, copiedSecrets: copiedCount, seededFlags: flags.length }
        : { seededFlags: flags.length },
    });

    reply.code(201).send(toEnvironmentDto(env));
  });

  app.get('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const scopedEnvIds = request.auth?.scopeEnvironmentIds;
    const envs = await prisma.environment.findMany({
      where: {
        projectId,
        ...(request.auth?.viaToken && scopedEnvIds ? { id: { in: scopedEnvIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(envs.map(toEnvironmentDto));
  });

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

    const env = await prisma.environment.findFirst({
      where: { projectId, slug },
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

    const { id: projectId, environmentId } = request.params as { id: string; environmentId: string };
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
