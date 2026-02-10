import { Prisma, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole, requireUserForApproval } from '../auth/guards.js';
import { logAudit } from '../services/audit.js';
import {
  createApprovalRequest,
  findMatchingApprovalRules,
  findPendingApprovalRequest,
} from '../services/approvals.js';
import {
  isFeatureFlagValueType,
  toFeatureFlagEnvironmentOverrideDto,
  toFeatureFlagDto,
  toFeatureFlagRuleDto,
  toFeatureFlagVariantDto,
} from '../mappers/flags.js';

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

  app.get('/projects/:projectId/flags', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const flags = await prisma.featureFlag.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(flags.map(toFeatureFlagDto));
  });

  app.post('/projects/:projectId/flags', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const body = request.body as
      | {
          key?: string;
          name?: string;
          description?: string | null;
          valueType?: 'BOOLEAN' | 'MULTIVARIATE';
          enabled?: boolean;
        }
      | undefined;
    const key = body?.key?.trim();
    const name = body?.name?.trim();
    if (!key || !name) {
      reply.code(400).send({ error: 'key and name are required' });
      return;
    }
    if (body?.valueType && !isFeatureFlagValueType(body.valueType)) {
      reply.code(400).send({ error: 'valueType must be BOOLEAN or MULTIVARIATE' });
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

    try {
      const flag = await prisma.featureFlag.create({
        data: {
          projectId,
          key,
          name,
          description: body?.description?.trim() ?? null,
          valueType: body?.valueType ?? 'BOOLEAN',
          enabled: typeof body?.enabled === 'boolean' ? body.enabled : true,
        },
      });
      await logAudit({
        projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'flag.create',
        resourceType: 'feature_flag',
        resourceId: flag.id,
        metadataJson: { module: 'flags', key: flag.key },
      });
      reply.code(201).send(toFeatureFlagDto(flag));
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
    const role = await requireProjectRole(request, reply, flag.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    reply.send(toFeatureFlagDto(flag));
  });

  app.patch('/flags/:flagId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { flagId } = request.params as { flagId: string };
    const current = await prisma.featureFlag.findFirst({
      where: { id: flagId, deletedAt: null },
    });
    if (!current) {
      reply.code(404).send({ error: 'Flag not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, current.projectId, Role.EDITOR);
    if (!role) {
      return;
    }
    const body = request.body as
      | {
          key?: string;
          name?: string;
          description?: string | null;
          valueType?: 'BOOLEAN' | 'MULTIVARIATE';
          enabled?: boolean;
        }
      | undefined;

    if (body?.valueType && !isFeatureFlagValueType(body.valueType)) {
      reply.code(400).send({ error: 'valueType must be BOOLEAN or MULTIVARIATE' });
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

    try {
      const updated = await prisma.featureFlag.update({
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
      await logAudit({
        projectId: current.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'flag.update',
        resourceType: 'feature_flag',
        resourceId: updated.id,
        metadataJson: { module: 'flags', key: updated.key },
      });
      reply.send(toFeatureFlagDto(updated));
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        reply.code(409).send({ error: 'Flag key already exists' });
        return;
      }
      throw error;
    }
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

  app.post('/flags/:flagId/variants', async (request, reply) => {
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
    const body = request.body as { key?: string; value?: string; weight?: number } | undefined;
    const key = body?.key?.trim();
    const value = body?.value;
    if (!key || typeof value !== 'string') {
      reply.code(400).send({ error: 'key and value are required' });
      return;
    }
    const weight = typeof body?.weight === 'number' ? body.weight : 0;
    if (!Number.isFinite(weight) || weight < 0) {
      reply.code(400).send({ error: 'weight must be >= 0' });
      return;
    }

    try {
      const variant = await prisma.featureFlagVariant.create({
        data: {
          flagId: flag.id,
          key,
          value,
          weight: Math.floor(weight),
        },
      });
      await logAudit({
        projectId: flag.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'flag.variant.create',
        resourceType: 'feature_flag_variant',
        resourceId: variant.id,
        metadataJson: { module: 'flags', flagId: flag.id, key: variant.key },
      });
      reply.code(201).send(toFeatureFlagVariantDto(variant));
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        reply.code(409).send({ error: 'Variant key already exists' });
        return;
      }
      throw error;
    }
  });

  app.patch('/flag-variants/:variantId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { variantId } = request.params as { variantId: string };
    const variant = await prisma.featureFlagVariant.findUnique({
      where: { id: variantId },
      include: { flag: true },
    });
    if (!variant || variant.flag.deletedAt) {
      reply.code(404).send({ error: 'Variant not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, variant.flag.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const body = request.body as { key?: string; value?: string; weight?: number } | undefined;
    const nextWeight = body?.weight;
    if (
      typeof nextWeight !== 'undefined' &&
      (!Number.isFinite(nextWeight) || nextWeight < 0)
    ) {
      reply.code(400).send({ error: 'weight must be >= 0' });
      return;
    }

    try {
      const updated = await prisma.featureFlagVariant.update({
        where: { id: variant.id },
        data: {
          key: body?.key?.trim() ?? undefined,
          value: typeof body?.value === 'string' ? body.value : undefined,
          weight:
            typeof nextWeight === 'number' ? Math.floor(nextWeight) : undefined,
        },
      });
      await logAudit({
        projectId: variant.flag.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'flag.variant.update',
        resourceType: 'feature_flag_variant',
        resourceId: updated.id,
        metadataJson: { module: 'flags', flagId: updated.flagId, key: updated.key },
      });
      reply.send(toFeatureFlagVariantDto(updated));
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        reply.code(409).send({ error: 'Variant key already exists' });
        return;
      }
      throw error;
    }
  });

  app.delete('/flag-variants/:variantId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { variantId } = request.params as { variantId: string };
    const variant = await prisma.featureFlagVariant.findUnique({
      where: { id: variantId },
      include: { flag: true },
    });
    if (!variant || variant.flag.deletedAt) {
      reply.code(404).send({ error: 'Variant not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, variant.flag.projectId, Role.EDITOR);
    if (!role) {
      return;
    }
    await prisma.featureFlagVariant.delete({ where: { id: variant.id } });
    await logAudit({
      projectId: variant.flag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.variant.delete',
      resourceType: 'feature_flag_variant',
      resourceId: variant.id,
      metadataJson: { module: 'flags', flagId: variant.flagId, key: variant.key },
    });
    reply.send({ ok: true });
  });

  app.post('/flags/:flagId/rules', async (request, reply) => {
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
    const body = request.body as
      | { priority?: number; rolloutPercentage?: number; variantId?: string | null }
      | undefined;
    const priority = typeof body?.priority === 'number' ? body.priority : 0;
    const rolloutPercentage =
      typeof body?.rolloutPercentage === 'number' ? body.rolloutPercentage : 100;
    if (!Number.isFinite(priority) || priority < 0) {
      reply.code(400).send({ error: 'priority must be >= 0' });
      return;
    }
    if (
      !Number.isFinite(rolloutPercentage) ||
      rolloutPercentage < 0 ||
      rolloutPercentage > 100
    ) {
      reply.code(400).send({ error: 'rolloutPercentage must be between 0 and 100' });
      return;
    }

    const variantId = body?.variantId?.trim() ?? null;
    if (variantId) {
      const variant = await prisma.featureFlagVariant.findFirst({
        where: { id: variantId, flagId: flag.id },
        select: { id: true },
      });
      if (!variant) {
        reply.code(400).send({ error: 'variantId must belong to the same flag' });
        return;
      }
    }

    const rule = await prisma.featureFlagRule.create({
      data: {
        flagId: flag.id,
        priority: Math.floor(priority),
        rolloutPercentage: Math.floor(rolloutPercentage),
        variantId,
      },
    });
    await logAudit({
      projectId: flag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.rule.create',
      resourceType: 'feature_flag_rule',
      resourceId: rule.id,
      metadataJson: { module: 'flags', flagId: rule.flagId },
    });
    reply.code(201).send(toFeatureFlagRuleDto(rule));
  });

  app.patch('/flag-rules/:ruleId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { ruleId } = request.params as { ruleId: string };
    const rule = await prisma.featureFlagRule.findUnique({
      where: { id: ruleId },
      include: { flag: true },
    });
    if (!rule || rule.flag.deletedAt) {
      reply.code(404).send({ error: 'Rule not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, rule.flag.projectId, Role.EDITOR);
    if (!role) {
      return;
    }
    const body = request.body as
      | { priority?: number; rolloutPercentage?: number; variantId?: string | null }
      | undefined;

    if (
      typeof body?.priority !== 'undefined' &&
      (!Number.isFinite(body.priority) || body.priority < 0)
    ) {
      reply.code(400).send({ error: 'priority must be >= 0' });
      return;
    }
    if (
      typeof body?.rolloutPercentage !== 'undefined' &&
      (!Number.isFinite(body.rolloutPercentage) ||
        body.rolloutPercentage < 0 ||
        body.rolloutPercentage > 100)
    ) {
      reply.code(400).send({ error: 'rolloutPercentage must be between 0 and 100' });
      return;
    }

    const hasVariantId = Object.prototype.hasOwnProperty.call(body ?? {}, 'variantId');
    const variantId = hasVariantId ? body?.variantId?.trim() ?? null : undefined;
    if (typeof variantId === 'string') {
      const variant = await prisma.featureFlagVariant.findFirst({
        where: { id: variantId, flagId: rule.flagId },
        select: { id: true },
      });
      if (!variant) {
        reply.code(400).send({ error: 'variantId must belong to the same flag' });
        return;
      }
    }

    const updated = await prisma.featureFlagRule.update({
      where: { id: rule.id },
      data: {
        priority:
          typeof body?.priority === 'number' ? Math.floor(body.priority) : undefined,
        rolloutPercentage:
          typeof body?.rolloutPercentage === 'number'
            ? Math.floor(body.rolloutPercentage)
            : undefined,
        variantId,
      },
    });
    await logAudit({
      projectId: rule.flag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.rule.update',
      resourceType: 'feature_flag_rule',
      resourceId: updated.id,
      metadataJson: { module: 'flags', flagId: updated.flagId },
    });
    reply.send(toFeatureFlagRuleDto(updated));
  });

  app.delete('/flag-rules/:ruleId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { ruleId } = request.params as { ruleId: string };
    const rule = await prisma.featureFlagRule.findUnique({
      where: { id: ruleId },
      include: { flag: true },
    });
    if (!rule || rule.flag.deletedAt) {
      reply.code(404).send({ error: 'Rule not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, rule.flag.projectId, Role.EDITOR);
    if (!role) {
      return;
    }
    await prisma.featureFlagRule.delete({ where: { id: rule.id } });
    await logAudit({
      projectId: rule.flag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.rule.delete',
      resourceType: 'feature_flag_rule',
      resourceId: rule.id,
      metadataJson: { module: 'flags', flagId: rule.flagId },
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

  app.put('/flags/:flagId/environments/:environmentId/override', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { flagId, environmentId } = request.params as {
      flagId: string;
      environmentId: string;
    };

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

    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, projectId: true },
    });
    if (!environment || environment.projectId !== flag.projectId) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const body = request.body as
      | {
          enabled?: boolean | null;
          variantId?: string | null;
        }
      | undefined;

    if (!body) {
      reply.code(400).send({ error: 'Request body is required' });
      return;
    }

    const hasEnabled = Object.prototype.hasOwnProperty.call(body, 'enabled');
    const hasVariantId = Object.prototype.hasOwnProperty.call(body, 'variantId');
    if (!hasEnabled && !hasVariantId) {
      reply.code(400).send({ error: 'enabled or variantId is required' });
      return;
    }

    const enabled = hasEnabled ? (body.enabled ?? null) : null;
    const variantId = hasVariantId ? body.variantId?.trim() ?? null : null;

    if (typeof enabled !== 'boolean' && enabled !== null) {
      reply.code(400).send({ error: 'enabled must be boolean or null' });
      return;
    }

    if (variantId) {
      const variant = await prisma.featureFlagVariant.findFirst({
        where: { id: variantId, flagId: flag.id },
        select: { id: true },
      });
      if (!variant) {
        reply.code(400).send({ error: 'variantId must belong to the same flag' });
        return;
      }
    }

    const existingOverride = await prisma.featureFlagEnvironmentOverride.findUnique({
      where: {
        flagId_environmentId: {
          flagId: flag.id,
          environmentId: environment.id,
        },
      },
    });
    const approvalAction =
      enabled === null && variantId === null
        ? 'DELETE'
        : existingOverride
          ? 'UPDATE'
          : 'CREATE';

    const matchingRules = await findMatchingApprovalRules({
      projectId: flag.projectId,
      environmentId: environment.id,
      action: approvalAction,
      key: flag.key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      if (!auth.user) {
        reply.code(403).send({ error: 'Approval requests require a user session' });
        return;
      }

      const pending = await findPendingApprovalRequest({
        projectId: flag.projectId,
        environmentId: environment.id,
        action: approvalAction,
        key: flag.key,
      });
      if (pending) {
        reply.code(202).send({ status: 'pending', approvalRequestId: pending.id });
        return;
      }

      const approval = await createApprovalRequest({
        projectId: flag.projectId,
        environmentId: environment.id,
        action: approvalAction,
        key: flag.key,
        requestedBy: auth.user.id,
        metadataJson: {
          module: 'flags',
          resourceType: 'feature_flag_env_override',
          flagId: flag.id,
          environmentId: environment.id,
          overrideEnabled: enabled,
          variantId,
        },
      });

      await logAudit({
        projectId: flag.projectId,
        actorUserId: auth.user.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          module: 'flags',
          action: approvalAction,
          key: flag.key,
          flagId: flag.id,
          environmentId: environment.id,
        },
      });

      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    if (enabled === null && variantId === null) {
      await prisma.featureFlagEnvironmentOverride.deleteMany({
        where: {
          flagId: flag.id,
          environmentId: environment.id,
        },
      });
      await logAudit({
        projectId: flag.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'flag.override.delete',
        resourceType: 'feature_flag_env_override',
        resourceId: `${flag.id}:${environment.id}`,
        metadataJson: { module: 'flags', flagId: flag.id, environmentId: environment.id },
      });
      reply.send({ ok: true });
      return;
    }

    const upserted = await prisma.featureFlagEnvironmentOverride.upsert({
      where: {
        flagId_environmentId: {
          flagId: flag.id,
          environmentId: environment.id,
        },
      },
      create: {
        flagId: flag.id,
        environmentId: environment.id,
        enabled,
        variantId,
      },
      update: {
        enabled,
        variantId,
      },
    });

    await logAudit({
      projectId: flag.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'flag.override.update',
      resourceType: 'feature_flag_env_override',
      resourceId: upserted.id,
      metadataJson: {
        module: 'flags',
        flagId: upserted.flagId,
        environmentId: upserted.environmentId,
        enabled: upserted.enabled,
        variantId: upserted.variantId,
      },
    });

    reply.send(toFeatureFlagEnvironmentOverrideDto(upserted));
  });
}
