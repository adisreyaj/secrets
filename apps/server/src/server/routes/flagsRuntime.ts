import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashToken } from '../../auth.js';
import { prisma } from '../../db.js';
import { evaluateFlag } from '../services/flags/evaluation.js';

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
  app.post('/runtime/flags/evaluate', async (request, reply) => {
    const runtimeAuth = await requireRuntimeSdkKey(app, request, reply);
    if (!runtimeAuth) {
      return;
    }

    const body = request.body as
      | {
          environmentId?: string;
          flagKey?: string;
          subjectKey?: string;
        }
      | undefined;
    const environmentId = body?.environmentId?.trim();
    const flagKey = body?.flagKey?.trim();
    const subjectKey = body?.subjectKey?.trim();
    if (!environmentId || !flagKey || !subjectKey) {
      reply
        .code(400)
        .send({ error: 'environmentId, flagKey, and subjectKey are required' });
      return;
    }

    const flag = await prisma.featureFlag.findFirst({
      where: {
        projectId: runtimeAuth.projectId,
        key: flagKey,
        deletedAt: null,
      },
      include: {
        variants: true,
        rules: true,
        envOverrides: {
          where: { environmentId },
          take: 1,
        },
      },
    });

    if (!flag) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }

    const result = evaluateFlag({
      flag,
      rules: flag.rules,
      variants: flag.variants,
      override: flag.envOverrides[0] ?? null,
      subjectKey,
    });

    reply.send({
      flagKey: flag.key,
      projectId: flag.projectId,
      environmentId,
      ...result,
    });
  });

  app.post('/runtime/flags/evaluate/batch', async (request, reply) => {
    const runtimeAuth = await requireRuntimeSdkKey(app, request, reply);
    if (!runtimeAuth) {
      return;
    }

    const body = request.body as
      | {
          environmentId?: string;
          subjectKey?: string;
          flagKeys?: string[];
        }
      | undefined;
    const environmentId = body?.environmentId?.trim();
    const subjectKey = body?.subjectKey?.trim();
    if (!environmentId || !subjectKey) {
      reply.code(400).send({ error: 'environmentId and subjectKey are required' });
      return;
    }

    const flagKeys = (body?.flagKeys ?? [])
      .map((key) => key?.trim())
      .filter((key): key is string => Boolean(key));

    const flags = await prisma.featureFlag.findMany({
      where: {
        projectId: runtimeAuth.projectId,
        deletedAt: null,
        ...(flagKeys.length > 0 ? { key: { in: flagKeys } } : {}),
      },
      include: {
        variants: true,
        rules: true,
        envOverrides: {
          where: { environmentId },
        },
      },
    });

    const results = flags.map((flag) => {
      const evaluation = evaluateFlag({
        flag,
        rules: flag.rules,
        variants: flag.variants,
        override: flag.envOverrides[0] ?? null,
        subjectKey,
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
  });
}
