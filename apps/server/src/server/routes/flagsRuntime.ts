import { performance } from 'node:perf_hooks';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashToken } from '../../auth.js';
import { prisma } from '../../db.js';
import { evaluateFlag } from '../services/flags/evaluation.js';
import { createRuntimeCatalogCache } from '../services/flags/runtimeCache.js';

type FlagWithEnvConfig = Prisma.FeatureFlagGetPayload<{
  include: {
    environmentConfigs: true;
  };
}>;

type RuntimeAuth = {
  projectId: string;
  sdkKeyId: string;
};

async function requireRuntimeSdkKey(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<RuntimeAuth | null> {
  const header =
    request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice('Bearer '.length).trim()
      : (request.headers['x-flag-sdk-key'] as string | undefined)?.trim();

  if (!header) {
    reply.code(401).send({ error: 'Missing SDK key' });
    return null;
  }

  const tokenHash = hashToken(header);
  const sdkKey = await prisma.featureFlagSdkKey.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (!sdkKey) {
    reply.code(401).send({ error: 'Invalid SDK key' });
    return null;
  }

  await prisma.featureFlagSdkKey.update({
    where: { id: sdkKey.id },
    data: { lastUsedAt: new Date() },
  });

  app.log.debug(
    { event: 'flag.runtime.authenticated', sdkKeyId: sdkKey.id, projectId: sdkKey.projectId },
    'runtime flag request authenticated',
  );

  return {
    projectId: sdkKey.projectId,
    sdkKeyId: sdkKey.id,
  };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const runtimeCatalogCache = createRuntimeCatalogCache<FlagWithEnvConfig[]>(5000);

  app.post(
    '/runtime/flags/evaluate',
    { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const runtimeAuth = await requireRuntimeSdkKey(app, request, reply);
    if (!runtimeAuth) {
      return;
    }

    const body = request.body as
      | {
          environmentId?: string;
          flagKey?: string;
          subjectKey?: string;
          runtime?: 'client' | 'server';
        }
      | undefined;
    const environmentId = body?.environmentId?.trim();
    const flagKey = body?.flagKey?.trim();
    const subjectKey = body?.subjectKey?.trim();
    const runtime =
      body?.runtime === 'client' || body?.runtime === 'server'
        ? body.runtime
        : 'server';
    if (!environmentId || !flagKey || !subjectKey) {
      reply
        .code(400)
        .send({ error: 'environmentId, flagKey, and subjectKey are required' });
      return;
    }

    const startedAt = performance.now();
    const flags = await runtimeCatalogCache.getOrLoad(
      {
        projectId: runtimeAuth.projectId,
        environmentId,
        flagKeys: [flagKey],
      },
      () =>
        prisma.featureFlag.findMany({
          where: {
            projectId: runtimeAuth.projectId,
            key: { in: [flagKey] },
            deletedAt: null,
          },
          include: {
            environmentConfigs: {
              where: { environmentId },
              take: 1,
            },
          },
        }),
    );
    const flag = flags[0];

    if (!flag) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }

    const config = flag.environmentConfigs[0];
    if (!config) {
      reply.send({
        flagKey: flag.key,
        projectId: flag.projectId,
        environmentId,
        enabled: false,
        reason: 'flag_not_configured' as const,
      });
      return;
    }

    const result = evaluateFlag({
      flag,
      config,
      runtime,
    });

    reply.send({
      flagKey: flag.key,
      projectId: flag.projectId,
      environmentId,
      ...result,
    });
    const durationMs = performance.now() - startedAt;
    if (durationMs > 120) {
      app.log.warn(
        { event: 'flag.runtime.slow', durationMs, sdkKeyId: runtimeAuth.sdkKeyId, flagKey },
        'runtime flag evaluation exceeded p95 target',
      );
    }
  });

  app.post(
    '/runtime/flags/evaluate/batch',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const runtimeAuth = await requireRuntimeSdkKey(app, request, reply);
    if (!runtimeAuth) {
      return;
    }

    const body = request.body as
      | {
          environmentId?: string;
          subjectKey?: string;
          flagKeys?: string[];
          runtime?: 'client' | 'server';
        }
      | undefined;
    const environmentId = body?.environmentId?.trim();
    const subjectKey = body?.subjectKey?.trim();
    const runtime =
      body?.runtime === 'client' || body?.runtime === 'server'
        ? body.runtime
        : 'server';
    if (!environmentId || !subjectKey) {
      reply.code(400).send({ error: 'environmentId and subjectKey are required' });
      return;
    }

    const flagKeys = (body?.flagKeys ?? [])
      .map((key) => key?.trim())
      .filter((key): key is string => Boolean(key));

    const startedAt = performance.now();
    const flags = await runtimeCatalogCache.getOrLoad(
      {
        projectId: runtimeAuth.projectId,
        environmentId,
        flagKeys: flagKeys.length > 0 ? flagKeys : undefined,
      },
      () =>
        prisma.featureFlag.findMany({
          where: {
            projectId: runtimeAuth.projectId,
            deletedAt: null,
            ...(flagKeys.length > 0 ? { key: { in: flagKeys } } : {}),
          },
          include: {
            environmentConfigs: {
              where: { environmentId },
              take: 1,
            },
          },
        }),
    );

    const results = flags.map((flag) => {
      const config = flag.environmentConfigs[0];
      if (!config) {
        return {
          flagKey: flag.key,
          projectId: flag.projectId,
          environmentId,
          enabled: false,
          reason: 'flag_not_configured' as const,
        };
      }
      const evaluation = evaluateFlag({
        flag,
        config,
        runtime,
      });

      return {
        flagKey: flag.key,
        projectId: flag.projectId,
        environmentId,
        ...evaluation,
      };
    });

    reply.send({
      projectId: runtimeAuth.projectId,
      environmentId,
      subjectKey,
      results,
    });
    const durationMs = performance.now() - startedAt;
    if (durationMs > 120) {
      app.log.warn(
        {
          event: 'flag.runtime.batch.slow',
          durationMs,
          sdkKeyId: runtimeAuth.sdkKeyId,
          flagCount: results.length,
        },
        'runtime batch flag evaluation exceeded p95 target',
      );
    }
  });
}
