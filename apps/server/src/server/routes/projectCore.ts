import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  db,
  isUniqueConstraintError,
  organizationMembers,
  ProjectModuleKey,
  projectMembers,
  projectModules,
  projects,
  Role,
} from '../../db/index.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { ROLE_RANK } from '../auth/policies.js';
import { sendError } from '../http/replies.js';
import { toProjectDto } from '../mappers/projects.js';
import { deleteProjectWithGuards } from '../services/deletions.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import { logAudit } from '../services/audit.js';
import { ensureUniqueProjectSlug } from '../services/slugs.js';
import { renameProjectWithGuards } from '../services/projectUpdates.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/projects', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const body = request.body as { name?: string; organizationId?: string } | undefined;
    const name = body?.name?.trim();
    const organizationId = body?.organizationId?.trim();
    if (!name) {
      sendError(reply, 400, 'Name is required');
      return;
    }
    if (!auth.user) {
      sendError(reply, 403, 'API token creation requires a user session');
      return;
    }
    if (organizationId) {
      const organizationMembership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, auth.user.id),
        ),
      });
      if (!organizationMembership) {
        sendError(reply, 403, 'Organization access denied');
        return;
      }
      if (ROLE_RANK[organizationMembership.role] < ROLE_RANK[Role.EDITOR]) {
        sendError(reply, 403, 'Insufficient organization role');
        return;
      }
    }

    const memberships = await db.query.projectMembers.findMany({
      where: eq(projectMembers.userId, auth.user.id),
      with: { project: { columns: { name: true } } },
    });
    const conflict = memberships.some(
      (membership) => normalizeIdentifier(membership.project.name) === normalizeIdentifier(name),
    );
    if (conflict) {
      sendError(reply, 409, 'Project name already exists');
      return;
    }

    const slug = await ensureUniqueProjectSlug(name);
    let project;
    try {
      project = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(projects)
          .values({
            name,
            slug,
            organizationId: organizationId ?? null,
          })
          .returning();

        await tx.insert(projectMembers).values({
          projectId: created.id,
          userId: auth.user!.id,
          role: Role.ADMIN,
        });

        await tx.insert(projectModules).values([
          { projectId: created.id, module: ProjectModuleKey.SECRETS, enabled: true },
          { projectId: created.id, module: ProjectModuleKey.FLAGS, enabled: true },
          { projectId: created.id, module: ProjectModuleKey.AUTH, enabled: true },
        ]);

        return created;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(reply, 409, 'Project name already exists');
        return;
      }
      throw error;
    }

    await logAudit({
      projectId: project.id,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'project.create',
      resourceType: 'project',
      resourceId: project.id,
    });

    reply.code(201).send(toProjectDto(project, Role.ADMIN));
  });

  app.get(
    '/projects',
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

      const query = request.query as { limit: number; cursor?: string };
      const limit = query.limit;
      const cursor = query.cursor;

      const all = await db.query.projectMembers.findMany({
        where: eq(projectMembers.userId, auth.user!.id),
        with: { project: true },
      });
      all.sort(
        (a, b) => b.project.createdAt.getTime() - a.project.createdAt.getTime(),
      );

      let start = 0;
      if (cursor) {
        const idx = all.findIndex((m) => m.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = all.slice(start, start + limit + 1);

      let nextCursor: string | undefined = undefined;
      if (page.length > limit) {
        const nextItem = page.pop();
        nextCursor = nextItem?.id;
      }

      reply.send({
        data: page.map((membership) => toProjectDto(membership.project, membership.role)),
        nextCursor,
      });
    },
  );

  app.put('/projects/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { name?: string } | undefined;
    if (!body?.name?.trim()) {
      sendError(reply, 400, 'Name is required');
      return;
    }

    const result = await renameProjectWithGuards({
      projectId,
      nextName: body.name.trim(),
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
    });

    if (!result.ok) {
      sendError(reply, result.status, result.error);
      return;
    }

    reply.send(toProjectDto(result.project, role));
  });

  app.put('/projects/:id/organization', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const projectRole = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!projectRole) {
      return;
    }

    const body = request.body as { organizationId?: string | null } | undefined;
    if (!body || !('organizationId' in body)) {
      sendError(reply, 400, 'organizationId is required');
      return;
    }

    const nextOrganizationId = body.organizationId?.trim() || null;
    if (nextOrganizationId) {
      const organizationMembership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, nextOrganizationId),
          eq(organizationMembers.userId, auth.user.id),
        ),
      });
      if (!organizationMembership) {
        sendError(reply, 403, 'Organization access denied');
        return;
      }
      if (ROLE_RANK[organizationMembership.role] < ROLE_RANK[Role.ADMIN]) {
        sendError(reply, 403, 'Insufficient organization role');
        return;
      }
    }

    const [project] = await db
      .update(projects)
      .set({ organizationId: nextOrganizationId })
      .where(eq(projects.id, projectId))
      .returning();

    if (!project) {
      sendError(reply, 404, 'Project not found');
      return;
    }

    reply.send(toProjectDto(project, projectRole));
  });

  app.delete('/projects/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { confirmText?: string } | undefined;
    if (!body?.confirmText?.trim()) {
      sendError(reply, 400, 'confirmText is required');
      return;
    }

    const result = await deleteProjectWithGuards({
      projectId,
      confirmText: body.confirmText,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
    });

    if (!result.ok) {
      sendError(reply, result.status, result.error);
      return;
    }

    reply.send({ ok: true });
  });

  app.get('/projects/slug/:slug', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { slug } = request.params as { slug: string };
    const project = await db.query.projects.findFirst({ where: eq(projects.slug, slug) });
    if (!project) {
      sendError(reply, 404, 'Project not found');
      return;
    }

    const role = await requireProjectRole(request, reply, project.id, Role.VIEWER);
    if (!role) {
      return;
    }

    reply.send(toProjectDto(project, role));
  });
}
