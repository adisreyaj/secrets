import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateToken, hashToken } from '../../auth.js';
import {
  db,
  Role,
  serviceAccountEnvironments,
  serviceAccounts,
  serviceAccountTokenEnvironments,
  serviceAccountTokens,
} from '../../db/index.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { logAudit } from '../services/audit.js';

const createServiceAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  environmentIds: z.array(z.string()).default([]),
});

const createServiceAccountTokenSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.enum([Role.ADMIN, Role.EDITOR, Role.VIEWER]),
  readOnly: z.boolean().optional(),
  environmentIds: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/projects/:id/service-accounts',
    {
      schema: {
        body: createServiceAccountSchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: projectId } = request.params as { id: string };
      const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
      if (!role) {
        return;
      }

      const { name, environmentIds } = request.body as z.infer<typeof createServiceAccountSchema>;

      const serviceAccount = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(serviceAccounts)
          .values({
            projectId,
            name,
            createdBy: auth.user!.id,
          })
          .returning();

        if (environmentIds.length > 0) {
          await tx.insert(serviceAccountEnvironments).values(
            environmentIds.map((environmentId) => ({
              serviceAccountId: created.id,
              environmentId,
            })),
          );
        }

        return created;
      });

      await logAudit({
        projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'service_account.create',
        resourceType: 'service_account',
        resourceId: serviceAccount.id,
      });

      reply.code(201).send({
        id: serviceAccount.id,
        projectId: serviceAccount.projectId,
        name: serviceAccount.name,
        createdBy: serviceAccount.createdBy,
        createdAt: serviceAccount.createdAt.toISOString(),
        environmentIds,
      });
    },
  );

  app.get('/projects/:id/service-accounts', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const rows = await db.query.serviceAccounts.findMany({
      where: eq(serviceAccounts.projectId, projectId),
      with: {
        environments: {
          columns: { environmentId: true },
        },
      },
      orderBy: [desc(serviceAccounts.createdAt)],
    });

    reply.send(
      rows.map((sa) => ({
        id: sa.id,
        projectId: sa.projectId,
        name: sa.name,
        createdBy: sa.createdBy,
        createdAt: sa.createdAt.toISOString(),
        environmentIds: sa.environments.map((e) => e.environmentId),
      })),
    );
  });

  app.delete('/projects/:id/service-accounts/:serviceAccountId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, serviceAccountId } = request.params as {
      id: string;
      serviceAccountId: string;
    };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const serviceAccount = await db.query.serviceAccounts.findFirst({
      where: and(eq(serviceAccounts.id, serviceAccountId), eq(serviceAccounts.projectId, projectId)),
    });

    if (!serviceAccount) {
      sendError(reply, 404, 'Service account not found');
      return;
    }

    await db.delete(serviceAccounts).where(eq(serviceAccounts.id, serviceAccountId));

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'service_account.delete',
      resourceType: 'service_account',
      resourceId: serviceAccountId,
    });

    reply.code(204).send();
  });

  app.post(
    '/service-accounts/:id/tokens',
    {
      schema: {
        body: createServiceAccountTokenSchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const { id: serviceAccountId } = request.params as { id: string };
      const { name, role, readOnly, environmentIds, expiresAt } = request.body as z.infer<
        typeof createServiceAccountTokenSchema
      >;

      const serviceAccount = await db.query.serviceAccounts.findFirst({
        where: eq(serviceAccounts.id, serviceAccountId),
        with: { project: true },
      });

      if (!serviceAccount) {
        sendError(reply, 404, 'Service account not found');
        return;
      }

      const projectRole = await requireProjectRole(
        request,
        reply,
        serviceAccount.projectId,
        Role.ADMIN,
      );
      if (!projectRole) {
        return;
      }

      const raw = generateToken();
      const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
      const token = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(serviceAccountTokens)
          .values({
            serviceAccountId,
            name,
            role,
            tokenHash: hashToken(raw),
            readOnly: readOnly === true,
            expiresAt: parsedExpiresAt,
          })
          .returning();

        if (environmentIds.length > 0) {
          await tx.insert(serviceAccountTokenEnvironments).values(
            environmentIds.map((environmentId) => ({
              serviceAccountTokenId: created.id,
              environmentId,
            })),
          );
        }

        return created;
      });

      await logAudit({
        projectId: serviceAccount.projectId,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'service_account_token.create',
        resourceType: 'service_account_token',
        resourceId: token.id,
      });

      reply.code(201).send({
        token: raw,
        tokenMeta: {
          id: token.id,
          serviceAccountId: token.serviceAccountId,
          name: token.name,
          role: token.role,
          readOnly: token.readOnly,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          expiresAt: token.expiresAt?.toISOString() ?? null,
        },
      });
    },
  );

  app.get('/service-accounts/:id/tokens', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: serviceAccountId } = request.params as { id: string };

    const serviceAccount = await db.query.serviceAccounts.findFirst({
      where: eq(serviceAccounts.id, serviceAccountId),
    });

    if (!serviceAccount) {
      sendError(reply, 404, 'Service account not found');
      return;
    }

    const role = await requireProjectRole(request, reply, serviceAccount.projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const tokens = await db.query.serviceAccountTokens.findMany({
      where: eq(serviceAccountTokens.serviceAccountId, serviceAccountId),
      with: {
        environments: {
          columns: { environmentId: true },
        },
      },
      orderBy: [desc(serviceAccountTokens.createdAt)],
    });

    reply.send(
      tokens.map((token) => ({
        id: token.id,
        serviceAccountId: token.serviceAccountId,
        name: token.name,
        role: token.role,
        readOnly: token.readOnly,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
        environmentIds: token.environments.map((e) => e.environmentId),
      })),
    );
  });

  app.delete('/service-accounts/:serviceAccountId/tokens/:tokenId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { serviceAccountId, tokenId } = request.params as {
      serviceAccountId: string;
      tokenId: string;
    };

    const serviceAccount = await db.query.serviceAccounts.findFirst({
      where: eq(serviceAccounts.id, serviceAccountId),
    });

    if (!serviceAccount) {
      sendError(reply, 404, 'Service account not found');
      return;
    }

    const role = await requireProjectRole(request, reply, serviceAccount.projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const token = await db.query.serviceAccountTokens.findFirst({
      where: and(
        eq(serviceAccountTokens.id, tokenId),
        eq(serviceAccountTokens.serviceAccountId, serviceAccountId),
      ),
    });

    if (!token) {
      sendError(reply, 404, 'Token not found');
      return;
    }

    await db.delete(serviceAccountTokens).where(eq(serviceAccountTokens.id, tokenId));

    await logAudit({
      projectId: serviceAccount.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'service_account_token.delete',
      resourceType: 'service_account_token',
      resourceId: tokenId,
    });

    reply.code(204).send();
  });
}
