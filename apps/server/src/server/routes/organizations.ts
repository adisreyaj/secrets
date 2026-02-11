import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import {
  toOrganizationDto,
  toOrganizationMemberDto,
} from '../mappers/organizations.js';
import { isPrismaUniqueError } from '../services/prismaErrors.js';
import { ensureUniqueOrganizationSlug } from '../services/slugs.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/organizations', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const body = request.body as { name?: string } | undefined;
    const name = body?.name?.trim();
    if (!name) {
      sendError(reply, 400, 'Name is required');
      return;
    }

    const slug = await ensureUniqueOrganizationSlug(name);

    try {
      const organization = await prisma.organization.create({
        data: {
          name,
          slug,
          members: {
            create: {
              userId: auth.user.id,
              role: Role.ADMIN,
            },
          },
        },
      });
      reply.code(201).send({ organization: toOrganizationDto(organization) });
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        sendError(reply, 409, 'Organization name already exists');
        return;
      }
      throw error;
    }
  });

  app.get('/organizations', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const organizations = await prisma.organizationMember.findMany({
      where: { userId: auth.user.id },
      include: { organization: true },
      orderBy: { organization: { createdAt: 'desc' } },
    });

    reply.send({
      organizations: organizations.map(({ organization }) =>
        toOrganizationDto(organization),
      ),
    });
  });

  app.get('/organizations/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const { id } = request.params as { id: string };
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: id,
          userId: auth.user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      sendError(reply, 404, 'Organization not found');
      return;
    }

    reply.send({ organization: toOrganizationDto(membership.organization) });
  });

  app.get('/organizations/:id/members', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const { id } = request.params as { id: string };
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: id,
          userId: auth.user.id,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      sendError(reply, 404, 'Organization not found');
      return;
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: id },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    reply.send({ members: members.map(toOrganizationMemberDto) });
  });

  app.post('/organizations/:id/members', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const { id } = request.params as { id: string };
    const actorMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: id,
          userId: auth.user.id,
        },
      },
    });
    if (!actorMembership) {
      sendError(reply, 404, 'Organization not found');
      return;
    }
    if (actorMembership.role !== Role.ADMIN) {
      sendError(reply, 403, 'Insufficient role');
      return;
    }

    const body = request.body as { email?: string; role?: Role } | undefined;
    const email = body?.email?.trim().toLowerCase();
    const role = body?.role;
    if (!email || !role) {
      sendError(reply, 400, 'Email and role are required');
      return;
    }
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(role)) {
      sendError(reply, 400, 'Invalid role');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      sendError(reply, 404, 'User not found');
      return;
    }

    try {
      const member = await prisma.organizationMember.create({
        data: {
          organizationId: id,
          userId: user.id,
          role,
        },
        include: { user: true },
      });
      reply.code(201).send({ member: toOrganizationMemberDto(member) });
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        sendError(reply, 409, 'User already belongs to organization');
        return;
      }
      throw error;
    }
  });
}
