import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { ROLE_RANK } from '../auth/policies.js';
import { sendError } from '../http/replies.js';
import { toProjectDto } from '../mappers/projects.js';
import { deleteProjectWithGuards } from '../services/deletions.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import { isPrismaUniqueError } from '../services/prismaErrors.js';
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
      const organizationMembership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: auth.user.id,
          },
        },
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

    const memberships = await prisma.projectMember.findMany({
      where: { userId: auth.user.id },
      select: { project: { select: { name: true } } },
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
      project = await prisma.project.create({
        data: {
          name,
          slug,
          organizationId: organizationId ?? null,
          members: {
            create: {
              userId: auth.user!.id,
              role: Role.ADMIN,
            },
          },
          modules: {
            create: [
              { module: 'SECRETS', enabled: true },
              { module: 'FLAGS', enabled: true },
              { module: 'AUTH', enabled: true },
            ],
          },
        },
      });
    } catch (error) {
      if (isPrismaUniqueError(error)) {
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

  app.get('/projects', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const memberships = await prisma.projectMember.findMany({
      where: { userId: auth.user!.id },
      include: { project: true },
    });

    reply.send(memberships.map((membership) => toProjectDto(membership.project, membership.role)));
  });

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
      const organizationMembership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: nextOrganizationId,
            userId: auth.user.id,
          },
        },
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

    const project = await prisma.project.update({
      where: { id: projectId },
      data: { organizationId: nextOrganizationId },
    });

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
    const project = await prisma.project.findUnique({ where: { slug } });
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
