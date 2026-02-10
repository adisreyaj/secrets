import { Prisma, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import {
  isFeatureFlagValueType,
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
    reply.send({ ok: true });
  });
}
