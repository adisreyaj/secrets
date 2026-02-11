import { Prisma, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { logAudit } from '../services/audit.js';
import { isFeatureFlagValueType, toFeatureFlagDto } from '../mappers/flags.js';

function isPrismaUniqueError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function parseRuntime(value: unknown): 'BOTH' | 'CLIENT' | 'SERVER' {
  if (typeof value !== 'string') return 'BOTH';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'client') return 'CLIENT';
  if (normalized === 'server') return 'SERVER';
  return 'BOTH';
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return [...seen];
}

type MultivariateInput = {
  defaultVariantKey: string;
  variants: Array<{
    key: string;
    valueType: 'string' | 'json';
    value: string;
  }>;
};

function validateMultivariate(input: unknown): MultivariateInput {
  if (!input || typeof input !== 'object') {
    throw new Error('multivariate is required for MULTIVARIATE flags');
  }
  const obj = input as {
    defaultVariantKey?: string;
    variants?: Array<{ key?: string; valueType?: string; value?: string }>;
  };
  const defaultVariantKey = obj.defaultVariantKey?.trim();
  if (!defaultVariantKey) {
    throw new Error('multivariate.defaultVariantKey is required');
  }
  if (!Array.isArray(obj.variants) || obj.variants.length === 0) {
    throw new Error('multivariate.variants must contain at least one variant');
  }

  const variants = obj.variants.map((variant) => {
    const key = variant.key?.trim();
    const value = variant.value;
    const valueType = variant.valueType?.trim().toLowerCase();
    if (!key || typeof value !== 'string') {
      throw new Error('Each multivariate variant requires key and value');
    }
    if (valueType !== 'string' && valueType !== 'json') {
      throw new Error('Variant valueType must be string or json');
    }
    if (valueType === 'json') {
      try {
        JSON.parse(value);
      } catch {
        throw new Error(`Variant ${key} has invalid JSON value`);
      }
    }
    return {
      key,
      value,
      valueType: valueType as 'string' | 'json',
    };
  });

  if (!variants.some((variant) => variant.key === defaultVariantKey)) {
    throw new Error('multivariate.defaultVariantKey must match an existing variant key');
  }

  return {
    defaultVariantKey,
    variants,
  };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const recordFlagChange = async (params: {
    projectId: string;
    flagId?: string | null;
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadataJson?: Record<string, unknown> | null;
  }) => {
    await prisma.featureFlagChangeHistory.create({
      data: {
        projectId: params.projectId,
        flagId: params.flagId ?? null,
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        metadataJson:
          (params.metadataJson as Prisma.InputJsonValue | null | undefined) ??
          undefined,
      },
    });
  };

  const toFlagSdkKeyDto = (key: {
    id: string;
    projectId: string;
    name: string;
    keyPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }) => ({
    id: key.id,
    projectId: key.projectId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  });

  const upsertEnvironmentConfig = async (params: {
    flagId: string;
    environmentId: string;
    valueType: 'BOOLEAN' | 'MULTIVARIATE';
    enabled: boolean;
    runtime: 'BOTH' | 'CLIENT' | 'SERVER';
    labels: string[];
    booleanValue?: boolean | null;
    multivariate?: MultivariateInput | null;
  }) => {
    const configRecord = await prisma.featureFlagEnvironmentConfig.upsert({
      where: {
        flagId_environmentId: {
          flagId: params.flagId,
          environmentId: params.environmentId,
        },
      },
      create: {
        flagId: params.flagId,
        environmentId: params.environmentId,
        enabled: params.enabled,
        valueType: params.valueType,
        booleanValue:
          params.valueType === 'BOOLEAN' ? params.booleanValue ?? false : null,
        runtime: params.runtime,
        labelsJson: params.labels,
        defaultVariantKey:
          params.valueType === 'MULTIVARIATE'
            ? params.multivariate?.defaultVariantKey ?? null
            : null,
      },
      update: {
        enabled: params.enabled,
        valueType: params.valueType,
        booleanValue:
          params.valueType === 'BOOLEAN' ? params.booleanValue ?? false : null,
        runtime: params.runtime,
        labelsJson: params.labels,
        defaultVariantKey:
          params.valueType === 'MULTIVARIATE'
            ? params.multivariate?.defaultVariantKey ?? null
            : null,
      },
    });

    await prisma.featureFlagEnvironmentVariant.deleteMany({
      where: { environmentConfigId: configRecord.id },
    });

    if (params.valueType === 'MULTIVARIATE' && params.multivariate) {
      await prisma.featureFlagEnvironmentVariant.createMany({
        data: params.multivariate.variants.map((variant, index) => ({
          environmentConfigId: configRecord.id,
          key: variant.key,
          valueType: variant.valueType === 'json' ? 'JSON' : 'STRING',
          value: variant.value,
          orderIndex: index,
        })),
      });
    }

    const withVariants = await prisma.featureFlagEnvironmentConfig.findUnique({
      where: { id: configRecord.id },
      include: { variants: true },
    });

    return withVariants!;
  };

  app.get('/projects/:projectId/flags', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const { projectId } = request.params as { projectId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) return;

    const query = request.query as { environmentId?: string } | undefined;
    const environmentId = query?.environmentId?.trim();
    if (!environmentId) {
      reply.code(400).send({ error: 'environmentId is required' });
      return;
    }

    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, projectId: true },
    });
    if (!environment || environment.projectId !== projectId) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const flags = await prisma.featureFlag.findMany({
      where: { projectId, deletedAt: null },
      include: {
        environmentConfigs: {
          where: { environmentId },
          include: { variants: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const payload = flags
      .map((flag) => {
        const cfg = flag.environmentConfigs[0];
        if (!cfg) return null;
        return toFeatureFlagDto(flag, cfg);
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    reply.send(payload);
  });

  app.post('/projects/:projectId/flags', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const { projectId } = request.params as { projectId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) return;

    const body = request.body as
      | {
          environmentId?: string;
          key?: string;
          name?: string;
          description?: string | null;
          valueType?: 'BOOLEAN' | 'MULTIVARIATE';
          enabled?: boolean;
          booleanValue?: boolean;
          multivariate?: unknown;
          runtime?: 'both' | 'client' | 'server';
          labels?: unknown;
        }
      | undefined;

    const environmentId = body?.environmentId?.trim();
    const key = body?.key?.trim();
    const name = body?.name?.trim();

    if (!environmentId || !key || !name) {
      reply.code(400).send({ error: 'environmentId, key and name are required' });
      return;
    }
    if (!body?.valueType || !isFeatureFlagValueType(body.valueType)) {
      reply.code(400).send({ error: 'valueType must be BOOLEAN or MULTIVARIATE' });
      return;
    }

    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, projectId: true },
    });
    if (!environment || environment.projectId !== projectId) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const existing = await prisma.featureFlag.findMany({
      where: { projectId, deletedAt: null },
      select: { key: true },
    });
    const hasConflict = existing.some(
      (item) => normalizeIdentifier(item.key) === normalizeIdentifier(key),
    );
    if (hasConflict) {
      reply.code(409).send({ error: 'Flag key already exists' });
      return;
    }

    const labels = normalizeLabels(body.labels);
    const runtime = parseRuntime(body.runtime);
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

    let multivariate: MultivariateInput | null = null;
    if (body.valueType === 'MULTIVARIATE') {
      try {
        multivariate = validateMultivariate(body.multivariate);
      } catch (error) {
        reply.code(400).send({ error: (error as Error).message });
        return;
      }
    }

    try {
      const flag = await prisma.featureFlag.create({
        data: {
          projectId,
          key,
          name,
          description: body?.description?.trim() ?? null,
          valueType: body.valueType,
          enabled,
        },
      });

      const envConfig = await upsertEnvironmentConfig({
        flagId: flag.id,
        environmentId,
        valueType: body.valueType,
        enabled,
        runtime,
        labels,
        booleanValue: body.booleanValue,
        multivariate,
      });

      await logAudit({
        projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'flag.create',
        resourceType: 'feature_flag',
        resourceId: flag.id,
        metadataJson: { module: 'flags', key: flag.key, environmentId },
      });

      reply.code(201).send(toFeatureFlagDto(flag, envConfig));
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        reply.code(409).send({ error: 'Flag key already exists' });
        return;
      }
      throw error;
    }
  });

  app.get('/flags/:flagId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const { flagId } = request.params as { flagId: string };
    const query = request.query as { environmentId?: string } | undefined;
    const environmentId = query?.environmentId?.trim();
    if (!environmentId) {
      reply.code(400).send({ error: 'environmentId is required' });
      return;
    }

    const flag = await prisma.featureFlag.findFirst({
      where: { id: flagId, deletedAt: null },
      include: {
        environmentConfigs: {
          where: { environmentId },
          include: { variants: true },
          take: 1,
        },
      },
    });

    if (!flag) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, flag.projectId, Role.VIEWER);
    if (!role) return;

    const cfg = flag.environmentConfigs[0];
    if (!cfg) {
      reply.code(404).send({ error: 'Environment config not found' });
      return;
    }

    reply.send(toFeatureFlagDto(flag, cfg));
  });

  app.patch('/flags/:flagId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const { flagId } = request.params as { flagId: string };
    const current = await prisma.featureFlag.findFirst({
      where: { id: flagId, deletedAt: null },
    });
    if (!current) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, current.projectId, Role.EDITOR);
    if (!role) return;

    const body = request.body as
      | {
          environmentId?: string;
          key?: string;
          name?: string;
          description?: string | null;
          valueType?: 'BOOLEAN' | 'MULTIVARIATE';
          enabled?: boolean;
          booleanValue?: boolean;
          multivariate?: unknown;
          runtime?: 'both' | 'client' | 'server';
          labels?: unknown;
        }
      | undefined;

    const environmentId = body?.environmentId?.trim();
    if (!environmentId) {
      reply.code(400).send({ error: 'environmentId is required' });
      return;
    }

    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, projectId: true },
    });
    if (!environment || environment.projectId !== current.projectId) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const nextKey = body?.key?.trim();
    if (nextKey && normalizeIdentifier(nextKey) !== normalizeIdentifier(current.key)) {
      const siblings = await prisma.featureFlag.findMany({
        where: { projectId: current.projectId, deletedAt: null, NOT: { id: current.id } },
        select: { key: true },
      });
      const hasConflict = siblings.some(
        (item) => normalizeIdentifier(item.key) === normalizeIdentifier(nextKey),
      );
      if (hasConflict) {
        reply.code(409).send({ error: 'Flag key already exists' });
        return;
      }
    }

    const existingConfig = await prisma.featureFlagEnvironmentConfig.findUnique({
      where: {
        flagId_environmentId: { flagId: current.id, environmentId },
      },
      include: { variants: true },
    });

    const resolvedValueType = body?.valueType ?? existingConfig?.valueType ?? current.valueType;
    if (!isFeatureFlagValueType(resolvedValueType)) {
      reply.code(400).send({ error: 'valueType must be BOOLEAN or MULTIVARIATE' });
      return;
    }

    let multivariate: MultivariateInput | null = null;
    if (resolvedValueType === 'MULTIVARIATE') {
      try {
        multivariate = validateMultivariate(
          body?.multivariate ??
            (existingConfig
              ? {
                  defaultVariantKey: existingConfig.defaultVariantKey,
                  variants: existingConfig.variants.map((variant) => ({
                    key: variant.key,
                    valueType: variant.valueType === 'JSON' ? 'json' : 'string',
                    value: variant.value,
                  })),
                }
              : null),
        );
      } catch (error) {
        reply.code(400).send({ error: (error as Error).message });
        return;
      }
    }

    const labels =
      typeof body?.labels !== 'undefined'
        ? normalizeLabels(body.labels)
        : existingConfig
          ? (Array.isArray(existingConfig.labelsJson)
              ? existingConfig.labelsJson.filter((item): item is string => typeof item === 'string')
              : [])
          : [];

    const runtime =
      typeof body?.runtime !== 'undefined'
        ? parseRuntime(body.runtime)
        : (existingConfig?.runtime ?? 'BOTH');

    const enabled =
      typeof body?.enabled === 'boolean'
        ? body.enabled
        : (existingConfig?.enabled ?? current.enabled);

    const updatedFlag = await prisma.featureFlag.update({
      where: { id: current.id },
      data: {
        key: nextKey ?? undefined,
        name: body?.name?.trim() ?? undefined,
        description: Object.prototype.hasOwnProperty.call(body ?? {}, 'description')
          ? body?.description?.trim() ?? null
          : undefined,
        valueType: body?.valueType ?? undefined,
        enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
      },
    });

    const envConfig = await upsertEnvironmentConfig({
      flagId: updatedFlag.id,
      environmentId,
      valueType: resolvedValueType,
      enabled,
      runtime,
      labels,
      booleanValue:
        typeof body?.booleanValue === 'boolean'
          ? body.booleanValue
          : existingConfig?.booleanValue ?? updatedFlag.enabled,
      multivariate,
    });

    await logAudit({
      projectId: updatedFlag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.update',
      resourceType: 'feature_flag',
      resourceId: updatedFlag.id,
      metadataJson: { module: 'flags', key: updatedFlag.key, environmentId },
    });

    reply.send(toFeatureFlagDto(updatedFlag, envConfig));
  });

  app.get('/flags/:flagId/diff', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const { flagId } = request.params as { flagId: string };
    const query = request.query as { fromEnvironmentId?: string; toEnvironmentId?: string };

    const fromEnvironmentId = query.fromEnvironmentId?.trim();
    const toEnvironmentId = query.toEnvironmentId?.trim();

    if (!fromEnvironmentId || !toEnvironmentId) {
      reply.code(400).send({ error: 'fromEnvironmentId and toEnvironmentId are required' });
      return;
    }

    const flag = await prisma.featureFlag.findFirst({
      where: { id: flagId, deletedAt: null },
    });
    if (!flag) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, flag.projectId, Role.VIEWER);
    if (!role) return;

    const [fromConfig, toConfig] = await Promise.all([
      prisma.featureFlagEnvironmentConfig.findUnique({
        where: { flagId_environmentId: { flagId, environmentId: fromEnvironmentId } },
        include: { variants: true },
      }),
      prisma.featureFlagEnvironmentConfig.findUnique({
        where: { flagId_environmentId: { flagId, environmentId: toEnvironmentId } },
        include: { variants: true },
      }),
    ]);

    if (!fromConfig || !toConfig) {
      reply.code(404).send({ error: 'Flag config not found for one or both environments' });
      return;
    }

    const toSnapshot = (cfg: NonNullable<typeof fromConfig>, environmentId: string) => ({
      environmentId,
      enabled: cfg.enabled,
      runtime: cfg.runtime.toLowerCase(),
      labels: Array.isArray(cfg.labelsJson)
        ? cfg.labelsJson.filter((item): item is string => typeof item === 'string')
        : [],
      valueType: cfg.valueType,
      booleanValue: cfg.booleanValue,
      multivariate:
        cfg.valueType === 'MULTIVARIATE'
          ? {
              defaultVariantKey: cfg.defaultVariantKey ?? '',
              variants: cfg.variants
                .slice()
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((variant) => ({
                  key: variant.key,
                  valueType: variant.valueType === 'JSON' ? 'json' : 'string',
                  value: variant.value,
                })),
            }
          : null,
    });

    const from = toSnapshot(fromConfig, fromEnvironmentId);
    const to = toSnapshot(toConfig, toEnvironmentId);

    reply.send({
      flagId: flag.id,
      flagKey: flag.key,
      from,
      to,
      differences: {
        enabled: from.enabled !== to.enabled,
        runtime: from.runtime !== to.runtime,
        labels: JSON.stringify(from.labels) !== JSON.stringify(to.labels),
        value:
          from.valueType !== to.valueType ||
          from.booleanValue !== to.booleanValue ||
          JSON.stringify(from.multivariate) !== JSON.stringify(to.multivariate),
      },
    });
  });

  app.delete('/flags/:flagId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { flagId } = request.params as { flagId: string };
    const flag = await prisma.featureFlag.findFirst({
      where: { id: flagId, deletedAt: null },
    });
    if (!flag) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, flag.projectId, Role.EDITOR);
    if (!role) {
      return;
    }
    await prisma.featureFlag.delete({ where: { id: flag.id } });
    await logAudit({
      projectId: flag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.delete',
      resourceType: 'feature_flag',
      resourceId: flag.id,
      metadataJson: { module: 'flags', key: flag.key },
    });
    reply.send({ ok: true });
  });

  app.get('/projects/:projectId/flag-sdk-keys', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const keys = await prisma.featureFlagSdkKey.findMany({
      where: { projectId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(keys.map(toFlagSdkKeyDto));
  });

  app.post('/projects/:projectId/flag-sdk-keys', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { name?: string; expiresAt?: string | null } | undefined;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400).send({ error: 'name is required' });
      return;
    }
    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;
    if (body?.expiresAt && Number.isNaN(expiresAt?.getTime())) {
      reply.code(400).send({ error: 'expiresAt must be a valid ISO date' });
      return;
    }

    const raw = `ffsk_${generateToken()}`;
    const prefix = raw.slice(0, 12);
    const key = await prisma.featureFlagSdkKey.create({
      data: {
        projectId,
        name,
        keyPrefix: prefix,
        tokenHash: hashToken(raw),
        createdBy: auth.user.id,
        expiresAt:
          expiresAt ??
          new Date(Date.now() + config.apiTokenTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    await recordFlagChange({
      projectId,
      actorUserId: auth.user.id,
      action: 'flag.sdk_key.create',
      resourceType: 'feature_flag_sdk_key',
      resourceId: key.id,
      metadataJson: { name: key.name, keyPrefix: key.keyPrefix },
    });

    reply.code(201).send({
      key: raw,
      keyMeta: toFlagSdkKeyDto(key),
    });
  });

  app.post('/flag-sdk-keys/:keyId/rotate', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { keyId } = request.params as { keyId: string };
    const existing = await prisma.featureFlagSdkKey.findUnique({
      where: { id: keyId },
    });
    if (!existing || existing.revokedAt) {
      reply.code(404).send({ error: 'SDK key not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, existing.projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const raw = `ffsk_${generateToken()}`;
    const prefix = raw.slice(0, 12);
    const rotated = await prisma.featureFlagSdkKey.update({
      where: { id: existing.id },
      data: {
        tokenHash: hashToken(raw),
        keyPrefix: prefix,
      },
    });

    await recordFlagChange({
      projectId: existing.projectId,
      actorUserId: auth.user.id,
      action: 'flag.sdk_key.rotate',
      resourceType: 'feature_flag_sdk_key',
      resourceId: existing.id,
      metadataJson: { keyPrefix: prefix },
    });

    reply.send({
      key: raw,
      keyMeta: toFlagSdkKeyDto(rotated),
    });
  });

  app.delete('/flag-sdk-keys/:keyId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { keyId } = request.params as { keyId: string };
    const key = await prisma.featureFlagSdkKey.findUnique({ where: { id: keyId } });
    if (!key || key.revokedAt) {
      reply.code(404).send({ error: 'SDK key not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, key.projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    await prisma.featureFlagSdkKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });

    await recordFlagChange({
      projectId: key.projectId,
      actorUserId: auth.user.id,
      action: 'flag.sdk_key.revoke',
      resourceType: 'feature_flag_sdk_key',
      resourceId: key.id,
      metadataJson: { name: key.name, keyPrefix: key.keyPrefix },
    });

    reply.send({ ok: true });
  });
}
