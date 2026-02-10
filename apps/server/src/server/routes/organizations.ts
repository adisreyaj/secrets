import { Prisma, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth } from '../auth/guards.js';
import {
  toOrganizationDto,
  toOrganizationMemberDto,
} from '../mappers/organizations.js';
import { ensureUniqueOrganizationSlug } from '../services/slugs.js';

function isPrismaUniqueError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/organizations', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth?.user) {
      return;
    }

    const body = request.body as { name?: string } | undefined;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400).send({ error: 'Name is required' });
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
        reply.code(409).send({ error: 'Organization name already exists' });
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
      reply.code(404).send({ error: 'Organization not found' });
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
      reply.code(404).send({ error: 'Organization not found' });
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
      reply.code(404).send({ error: 'Organization not found' });
      return;
    }
    if (actorMembership.role !== Role.ADMIN) {
      reply.code(403).send({ error: 'Insufficient role' });
      return;
    }

    const body = request.body as { email?: string; role?: Role } | undefined;
    const email = body?.email?.trim().toLowerCase();
    const role = body?.role;
    if (!email || !role) {
      reply.code(400).send({ error: 'Email and role are required' });
      return;
    }
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(role)) {
      reply.code(400).send({ error: 'Invalid role' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      reply.code(404).send({ error: 'User not found' });
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
        reply.code(409).send({ error: 'User already belongs to organization' });
        return;
      }
      throw error;
    }
  });
}
