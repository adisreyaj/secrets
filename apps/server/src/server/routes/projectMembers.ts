import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { isRole } from '../http/validators.js';
import { toInviteDto } from '../mappers/invites.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/projects/:id/members', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { email?: string; role?: string } | undefined;
    if (!body?.email || !body?.role || !isRole(body.role)) {
      sendError(reply, 400, 'Email and role are required');
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      sendError(reply, 404, 'User not found');
      return;
    }

    const membership = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, role: body.role },
      update: { role: body.role },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'project.member.add',
      resourceType: 'project_member',
      resourceId: membership.id,
      metadataJson: { memberUserId: user.id, role: body.role },
    });

    reply.code(201).send({ id: membership.id, userId: membership.userId, role: membership.role });
  });

  app.get('/projects/:id/members', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true },
    });

    reply.send(
      members.map((member) => ({
        id: member.id,
        projectId: member.projectId,
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role,
      })),
    );
  });

  app.post('/projects/:id/invites', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as { email?: string; role?: string } | undefined;
    if (!body?.email || !body?.role || !isRole(body.role)) {
      sendError(reply, 400, 'Email and role are required');
      return;
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    const existingMember = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { projectId },
          select: { id: true },
        },
      },
    });
    if (existingMember?.memberships.length) {
      sendError(reply, 409, 'User is already a project member');
      return;
    }

    const existingInvite = await prisma.projectInvite.findFirst({
      where: {
        projectId,
        email: normalizedEmail,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) {
      sendError(reply, 409, 'Active invite already exists for this email');
      return;
    }
    if (!auth.user) {
      sendError(reply, 403, 'Invites require a user session');
      return;
    }

    const token = generateToken();
    const invite = await prisma.projectInvite.create({
      data: {
        projectId,
        email: normalizedEmail,
        role: body.role,
        status: 'PENDING',
        tokenHash: hashToken(token),
        createdBy: auth.user.id,
        expiresAt: new Date(Date.now() + config.inviteTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'invite.create',
      resourceType: 'project_invite',
      resourceId: invite.id,
      metadataJson: { email: normalizedEmail, role: body.role },
    });

    reply.code(201).send({
      invite: toInviteDto(invite),
      token,
    });
  });

  app.get('/projects/:id/invites', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const invites = await prisma.projectInvite.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(invites.map(toInviteDto));
  });

  app.delete('/projects/:id/invites/:inviteId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, inviteId } = request.params as { id: string; inviteId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const invite = await prisma.projectInvite.findFirst({
      where: { id: inviteId, projectId },
    });
    if (!invite) {
      sendError(reply, 404, 'Invite not found');
      return;
    }

    await prisma.projectInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'invite.revoke',
      resourceType: 'project_invite',
      resourceId: inviteId,
    });

    reply.send({ ok: true });
  });

  app.post('/invites/accept', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const body = request.body as { token?: string } | undefined;
    const token = body?.token?.trim();
    if (!token) {
      sendError(reply, 400, 'Token is required');
      return;
    }

    const invite = await prisma.projectInvite.findFirst({
      where: {
        tokenHash: hashToken(token),
        status: 'PENDING',
      },
    });
    if (!invite) {
      sendError(reply, 404, 'Invite not found or already used');
      return;
    }

    if (invite.expiresAt <= new Date()) {
      await prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      sendError(reply, 410, 'Invite has expired');
      return;
    }
    if (!auth.user) {
      sendError(reply, 403, 'Invite acceptance requires a user session');
      return;
    }

    if (auth.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      sendError(reply, 403, 'Invite email does not match your account');
      return;
    }

    await prisma.$transaction([
      prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: invite.projectId,
            userId: auth.user.id,
          },
        },
        create: {
          projectId: invite.projectId,
          userId: auth.user.id,
          role: invite.role,
        },
        update: {
          role: invite.role,
        },
      }),
      prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      }),
    ]);

    await logAudit({
      projectId: invite.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'invite.accept',
      resourceType: 'project_invite',
      resourceId: invite.id,
    });

    const project = await prisma.project.findUnique({
      where: { id: invite.projectId },
      select: { slug: true },
    });
    reply.send({
      ok: true,
      projectId: invite.projectId,
      projectSlug: project?.slug ?? null,
    });
  });
}
