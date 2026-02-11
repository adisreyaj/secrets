import { Prisma, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { decryptSecret, loadMasterKey } from '../../crypto.js';
import { prisma } from '../../db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { tokenScopeDenied } from '../http/errors.js';
import { sendError } from '../http/replies.js';
import { ROLE_RANK } from '../auth/policies.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

  app.get('/projects/:id/secrets/search', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const query = request.query as {
      q?: string;
      environmentId?: string;
      includeValues?: string;
    };

    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const q = query.q?.trim();
    if (!q) {
      reply.send([]);
      return;
    }

    const where: Prisma.SecretWhereInput = {
      deletedAt: null,
      environment: { projectId },
      key: { contains: q },
    };

    const scopedEnvIds = request.auth?.scopeEnvironmentIds;
    if (query.environmentId) {
      if (request.auth?.viaToken && scopedEnvIds && !scopedEnvIds.includes(query.environmentId)) {
        tokenScopeDenied(reply);
        return;
      }
      where.environmentId = query.environmentId;
    } else if (request.auth?.viaToken && scopedEnvIds) {
      where.environmentId = { in: scopedEnvIds };
    }

    const secrets = await prisma.secret.findMany({
      where,
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
      take: 200,
    });

    const canViewValues =
      query.includeValues === 'true' && ROLE_RANK[role] >= ROLE_RANK.EDITOR;

    const data = secrets.map((secret) => {
      const version = secret.versions[0];
      let value: string | undefined;
      if (canViewValues && version) {
        value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
      }
      return {
        id: secret.id,
        key: secret.key,
        environmentId: secret.environmentId,
        environmentName: secret.environment.name,
        updatedAt: secret.updatedAt.toISOString(),
        value,
      };
    });

    reply.send(data);
  });

  app.get('/environments/:id/secrets', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const includeValues =
      request.query && (request.query as { includeValues?: string }).includeValues === 'true';

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      sendError(reply, 404, 'Environment not found');
      return;
    }
    if (!requireEnvironmentScope(request, reply, envId)) {
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const secrets = await prisma.secret.findMany({
      where: { environmentId: envId, deletedAt: null },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    const canViewValues = includeValues && ROLE_RANK[role] >= ROLE_RANK.EDITOR;

    const data = secrets.map((secret) => {
      const version = secret.versions[0];
      let value: string | undefined;
      if (canViewValues && version) {
        value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
      }

      return {
        id: secret.id,
        environmentId: secret.environmentId,
        key: secret.key,
        updatedAt: secret.updatedAt.toISOString(),
        versionId: version?.id,
        value,
      };
    });

    reply.send(data);
  });

  app.get('/secrets/:id/diff', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
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

    const versions = await prisma.secretVersion.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    if (versions.length < 2) {
      sendError(reply, 400, 'Not enough versions to diff');
      return;
    }

    const [current, previous] = versions;
    const currentValue = decryptSecret(
      { ciphertext: current.ciphertext, iv: current.iv, tag: current.tag },
      masterKey,
    );
    const previousValue = decryptSecret(
      { ciphertext: previous.ciphertext, iv: previous.iv, tag: previous.tag },
      masterKey,
    );

    reply.send({
      secretId,
      key: secret.key,
      current: {
        versionId: current.id,
        value: currentValue,
        createdAt: current.createdAt.toISOString(),
      },
      previous: {
        versionId: previous.id,
        value: previousValue,
        createdAt: previous.createdAt.toISOString(),
      },
    });
  });

  app.get('/secrets/:id/versions', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
    });
    if (!secret) {
      sendError(reply, 404, 'Secret not found');
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.VIEWER,
    );
    if (!role) {
      return;
    }

    const versions = await prisma.secretVersion.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, isActive: true },
    });

    reply.send(
      versions.map((version) => ({
        id: version.id,
        createdAt: version.createdAt.toISOString(),
        isActive: version.isActive,
      })),
    );
  });

  app.get('/secrets/diff', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { secretId, from, to } = request.query as {
      secretId?: string;
      from?: string;
      to?: string;
    };

    if (!secretId) {
      sendError(reply, 400, 'secretId is required');
      return;
    }

    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
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

    let versions: Array<{
      id: string;
      ciphertext: Uint8Array<ArrayBuffer>;
      iv: Uint8Array<ArrayBuffer>;
      tag: Uint8Array<ArrayBuffer>;
      createdAt: Date;
    }> = [];

    if (from && to) {
      versions = await prisma.secretVersion.findMany({
        where: { id: { in: [from, to] }, secretId },
        select: { id: true, ciphertext: true, iv: true, tag: true, createdAt: true },
      });
      if (versions.length !== 2) {
        sendError(reply, 400, 'Invalid version ids for diff');
        return;
      }
    } else {
      versions = await prisma.secretVersion.findMany({
        where: { secretId },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { id: true, ciphertext: true, iv: true, tag: true, createdAt: true },
      });
      if (versions.length < 2) {
        sendError(reply, 400, 'Not enough versions to diff');
        return;
      }
    }

    const [first, second] = versions;
    const current = from && to ? versions.find((v) => v.id === to)! : first;
    const previous = from && to ? versions.find((v) => v.id === from)! : second;

    const currentValue = decryptSecret(
      { ciphertext: current.ciphertext, iv: current.iv, tag: current.tag },
      masterKey,
    );
    const previousValue = decryptSecret(
      { ciphertext: previous.ciphertext, iv: previous.iv, tag: previous.tag },
      masterKey,
    );

    reply.send({
      secretId,
      key: secret.key,
      current: {
        versionId: current.id,
        value: currentValue,
        createdAt: current.createdAt.toISOString(),
      },
      previous: {
        versionId: previous.id,
        value: previousValue,
        createdAt: previous.createdAt.toISOString(),
      },
    });
  });
}
