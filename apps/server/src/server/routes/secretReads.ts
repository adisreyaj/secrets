import { and, asc, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, environments, Role, secrets, secretVersions } from '../../db/index.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { tokenScopeDenied } from '../http/errors.js';
import { sendError } from '../http/replies.js';
import { ROLE_RANK } from '../auth/policies.js';
import {
  decryptSecretWithKey,
  withEnvironmentDek,
} from '../services/envCrypto.js';
import {
  getActiveVersionsBySecretId,
  SECRET_ENVIRONMENT_COLUMNS,
} from '../services/secretQueries.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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

    const scopedEnvIds = request.auth?.scopeEnvironmentIds;
    let environmentIdFilter: string[] | string | null = null;
    if (query.environmentId) {
      if (request.auth?.viaToken && scopedEnvIds && !scopedEnvIds.includes(query.environmentId)) {
        tokenScopeDenied(reply);
        return;
      }
      environmentIdFilter = query.environmentId;
    } else if (request.auth?.viaToken && scopedEnvIds) {
      environmentIdFilter = scopedEnvIds;
    }

    const projectEnvs = await db.query.environments.findMany({
      where: eq(environments.projectId, projectId),
      columns: { id: true },
    });
    let envIds = projectEnvs.map((e) => e.id);
    if (typeof environmentIdFilter === 'string') {
      envIds = envIds.filter((id) => id === environmentIdFilter);
    } else if (Array.isArray(environmentIdFilter)) {
      envIds = envIds.filter((id) => environmentIdFilter.includes(id));
    }
    if (envIds.length === 0) {
      reply.send([]);
      return;
    }

    const secretRows = await db.query.secrets.findMany({
      where: and(
        isNull(secrets.deletedAt),
        inArray(secrets.environmentId, envIds),
        like(secrets.key, `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`),
      ),
      with: {
        environment: { columns: SECRET_ENVIRONMENT_COLUMNS },
      },
      orderBy: [asc(secrets.key)],
      limit: 200,
    });
    const versionsBySecretId = await getActiveVersionsBySecretId(secretRows.map((s) => s.id));

    const canViewValues =
      query.includeValues === 'true' && ROLE_RANK[role] >= ROLE_RANK.EDITOR;

    const envDekCache = new Map<string, Buffer>();
    const data = await Promise.all(
      secretRows.map(async (secret) => {
        const version = versionsBySecretId.get(secret.id);
        let value: string | undefined;
        if (canViewValues && version) {
          let dek = envDekCache.get(secret.environmentId);
          if (!dek) {
            dek = await withEnvironmentDek(secret.environmentId, (d) => d);
            envDekCache.set(secret.environmentId, dek);
          }
          value = decryptSecretWithKey(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            dek,
            secret.environmentId,
            secret.key,
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
      }),
    );

    reply.send(data);
  });

  app.get(
    '/environments/:id/secrets',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
          includeValues: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: envId } = request.params as { id: string };
      const query = request.query as { limit: number; cursor?: string; includeValues?: string };
      const includeValues = query.includeValues === 'true';

      const env = await db.query.environments.findFirst({
        where: eq(environments.id, envId),
      });
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

      const limit = query.limit;
      const cursor = query.cursor;

      const allSecrets = await db.query.secrets.findMany({
        where: and(eq(secrets.environmentId, envId), isNull(secrets.deletedAt)),
        orderBy: [asc(secrets.key)],
      });
      let start = 0;
      if (cursor) {
        const idx = allSecrets.findIndex((s) => s.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const secretPage = allSecrets.slice(start, start + limit + 1);

      let nextCursor: string | undefined = undefined;
      if (secretPage.length > limit) {
        const nextItem = secretPage.pop();
        nextCursor = nextItem?.id;
      }

      const versionsBySecretId = await getActiveVersionsBySecretId(secretPage.map((s) => s.id));
      const canViewValues = includeValues && ROLE_RANK[role] >= ROLE_RANK.EDITOR;

      const data = await (async () => {
        if (!canViewValues) {
          return secretPage.map((secret) => {
            const version = versionsBySecretId.get(secret.id);
            return {
              id: secret.id,
              environmentId: secret.environmentId,
              key: secret.key,
              updatedAt: secret.updatedAt.toISOString(),
              versionId: version?.id,
              value: undefined as string | undefined,
            };
          });
        }
        const dek = await withEnvironmentDek(envId, (d) => d);
        return secretPage.map((secret) => {
          const version = versionsBySecretId.get(secret.id);
          let value: string | undefined;
          if (version) {
            value = decryptSecretWithKey(
              { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
              dek,
              envId,
              secret.key,
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
      })();

      reply.send({
        data,
        nextCursor,
      });
    },
  );

  app.get('/secrets/:id/diff', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, secretId),
      with: { environment: { columns: SECRET_ENVIRONMENT_COLUMNS } },
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

    const versions = await db.query.secretVersions.findMany({
      where: eq(secretVersions.secretId, secretId),
      orderBy: [desc(secretVersions.createdAt)],
      limit: 2,
    });

    if (versions.length < 2) {
      sendError(reply, 400, 'Not enough versions to diff');
      return;
    }

    const [current, previous] = versions;
    const dek = await withEnvironmentDek(secret.environmentId, (d) => d);
    const currentValue = decryptSecretWithKey(
      { ciphertext: current.ciphertext, iv: current.iv, tag: current.tag },
      dek,
      secret.environmentId,
      secret.key,
    );
    const previousValue = decryptSecretWithKey(
      { ciphertext: previous.ciphertext, iv: previous.iv, tag: previous.tag },
      dek,
      secret.environmentId,
      secret.key,
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
    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, secretId),
      with: { environment: { columns: SECRET_ENVIRONMENT_COLUMNS } },
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

    const versions = await db.query.secretVersions.findMany({
      where: eq(secretVersions.secretId, secretId),
      orderBy: [desc(secretVersions.createdAt)],
      columns: { id: true, createdAt: true, isActive: true },
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

    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, secretId),
      with: { environment: { columns: SECRET_ENVIRONMENT_COLUMNS } },
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
      ciphertext: Buffer;
      iv: Buffer;
      tag: Buffer;
      createdAt: Date;
    }> = [];

    if (from && to) {
      versions = await db.query.secretVersions.findMany({
        where: and(inArray(secretVersions.id, [from, to]), eq(secretVersions.secretId, secretId)),
        columns: { id: true, ciphertext: true, iv: true, tag: true, createdAt: true },
      });
      if (versions.length !== 2) {
        sendError(reply, 400, 'Invalid version ids for diff');
        return;
      }
    } else {
      versions = await db.query.secretVersions.findMany({
        where: eq(secretVersions.secretId, secretId),
        orderBy: [desc(secretVersions.createdAt)],
        limit: 2,
        columns: { id: true, ciphertext: true, iv: true, tag: true, createdAt: true },
      });
      if (versions.length < 2) {
        sendError(reply, 400, 'Not enough versions to diff');
        return;
      }
    }

    const [first, second] = versions;
    const current = from && to ? versions.find((v) => v.id === to)! : first;
    const previous = from && to ? versions.find((v) => v.id === from)! : second;

    const dek = await withEnvironmentDek(secret.environmentId, (d) => d);
    const currentValue = decryptSecretWithKey(
      { ciphertext: current.ciphertext, iv: current.iv, tag: current.tag },
      dek,
      secret.environmentId,
      secret.key,
    );
    const previousValue = decryptSecretWithKey(
      { ciphertext: previous.ciphertext, iv: previous.iv, tag: previous.tag },
      dek,
      secret.environmentId,
      secret.key,
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
