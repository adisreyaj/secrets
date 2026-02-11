import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  ApprovalAction,
  ApprovalStatus,
  AuthClientType,
  AuthIdentityProvider,
  Prisma,
  Role,
} from '@prisma/client';
import Fastify, { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from './auth.js';
import { config } from './config.js';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from './crypto.js';
import { prisma } from './db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
  requireUserForApproval,
} from './server/auth/guards.js';
import { ROLE_RANK } from './server/auth/policies.js';
import { toApprovalRequestDto, toApprovalRuleDto } from './server/mappers/approvals.js';
import { toInviteDto } from './server/mappers/invites.js';
import { toEnvironmentDto, toProjectDto } from './server/mappers/projects.js';
import { toUserDto } from './server/mappers/users.js';
import { findMatchingApprovalRules, findPendingApprovalRequest, createApprovalRequest } from './server/services/approvals.js';
import { logAudit } from './server/services/audit.js';
import { deleteEnvironmentWithGuards, deleteProjectWithGuards } from './server/services/deletions.js';
import { registerCoreHttpMiddleware } from './server/http/middleware.js';
import { forbidden } from './server/http/errors.js';
import { registerRoutes as registerAuthRoutes } from './server/routes/auth.js';
import { registerRoutes as registerApiTokenRoutes } from './server/routes/apiTokens.js';
import { registerRoutes as registerAuditRoutes } from './server/routes/audit.js';
import { registerRoutes as registerExportRoutes } from './server/routes/exports.js';
import { registerRoutes as registerFlagRoutes } from './server/routes/flags.js';
import { registerRoutes as registerFlagRuntimeRoutes } from './server/routes/flagsRuntime.js';
import { registerRoutes as registerRuntimeAuthRoutes } from './server/routes/runtimeAuth.js';
import { registerRoutes as registerProjectSettingsRoutes } from './server/routes/projectSettings.js';
import { registerRoutes as registerOrganizationRoutes } from './server/routes/organizations.js';
import { registerRoutes as registerServiceAccountRoutes } from './server/routes/serviceAccounts.js';
import { ensureUniqueEnvironmentSlug, ensureUniqueProjectSlug } from './server/services/slugs.js';
import { normalizeIdentifier } from './server/services/identifiers.js';
import { isPrismaUniqueError } from './server/services/prismaErrors.js';
import { createLogDispatcher } from './server/logging/dispatcher.js';
import { isRole } from './server/http/validators.js';
import './types.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.logFormat === 'pretty'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true },
            },
          }
        : true,
    disableRequestLogging: true,
  });
  const logDispatcher = await createLogDispatcher(app.log, {
    service: 'server',
    env: config.env,
  });
  const masterKey = loadMasterKey();

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.appOrigins.includes(origin.replace(/\/$/, '')));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });
  registerCoreHttpMiddleware(app, logDispatcher);

  app.get('/health', async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerApiTokenRoutes(app);
  await registerAuditRoutes(app);
  await registerExportRoutes(app);
  await registerFlagRoutes(app);
  await registerFlagRuntimeRoutes(app);
  await registerRuntimeAuthRoutes(app);
  await registerProjectSettingsRoutes(app);
  await registerOrganizationRoutes(app);
  await registerServiceAccountRoutes(app);

  app.post('/projects', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const body = request.body as { name?: string; organizationId?: string } | undefined;
    const name = body?.name?.trim();
    const organizationId = body?.organizationId?.trim();
    if (!name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'API token creation requires a user session' });
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
        reply.code(403).send({ error: 'Organization access denied' });
        return;
      }
      if (ROLE_RANK[organizationMembership.role] < ROLE_RANK[Role.EDITOR]) {
        reply.code(403).send({ error: 'Insufficient organization role' });
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
      reply.code(409).send({ error: 'Project name already exists' });
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
        reply.code(409).send({ error: 'Project name already exists' });
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
      reply.code(400).send({ error: 'organizationId is required' });
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
        reply.code(403).send({ error: 'Organization access denied' });
        return;
      }
      if (ROLE_RANK[organizationMembership.role] < ROLE_RANK[Role.ADMIN]) {
        reply.code(403).send({ error: 'Insufficient organization role' });
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
      reply.code(400).send({ error: 'confirmText is required' });
      return;
    }

    const result = await deleteProjectWithGuards({
      projectId,
      confirmText: body.confirmText,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
    });

    if (!result.ok) {
      reply.code(result.status).send({ error: result.error });
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
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, project.id, Role.VIEWER);
    if (!role) {
      return;
    }

    reply.send(toProjectDto(project, role));
  });

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
      reply.code(400).send({ error: 'Email and role are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      reply.code(404).send({ error: 'User not found' });
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
      reply.code(400).send({ error: 'Email and role are required' });
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
      reply.code(409).send({ error: 'User is already a project member' });
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
      reply.code(409).send({ error: 'Active invite already exists for this email' });
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'Invites require a user session' });
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
      reply.code(404).send({ error: 'Invite not found' });
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
      reply.code(400).send({ error: 'Token is required' });
      return;
    }

    const invite = await prisma.projectInvite.findFirst({
      where: {
        tokenHash: hashToken(token),
        status: 'PENDING',
      },
    });
    if (!invite) {
      reply.code(404).send({ error: 'Invite not found or already used' });
      return;
    }

    if (invite.expiresAt <= new Date()) {
      await prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      reply.code(410).send({ error: 'Invite has expired' });
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'Invite acceptance requires a user session' });
      return;
    }

    if (auth.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      reply.code(403).send({ error: 'Invite email does not match your account' });
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

  app.get('/projects/:id/approval-rules', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const rules = await prisma.approvalRule.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(rules.map(toApprovalRuleDto));
  });

  app.post('/projects/:id/approval-rules', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    const body = request.body as
      | {
          name?: string;
          environmentId?: string | null;
          keyPattern?: string;
          actions?: ApprovalAction[];
          isActive?: boolean;
        }
      | undefined;
    if (!body?.name || !body.keyPattern || !Array.isArray(body.actions) || body.actions.length === 0) {
      reply.code(400).send({ error: 'Name, keyPattern, and actions are required' });
      return;
    }
    if (body.environmentId) {
      const env = await prisma.environment.findUnique({ where: { id: body.environmentId } });
      if (!env || env.projectId !== projectId) {
        reply.code(400).send({ error: 'Environment does not belong to project' });
        return;
      }
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'Approval rules require a user session' });
      return;
    }
    const rule = await prisma.approvalRule.create({
      data: {
        projectId,
        name: body.name.trim(),
        environmentId: body.environmentId ?? null,
        keyPattern: body.keyPattern.trim(),
        actionsJson: body.actions,
        isActive: body.isActive ?? true,
        createdBy: auth.user.id,
      },
    });
    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.rule.create',
      resourceType: 'approval_rule',
      resourceId: rule.id,
      metadataJson: { name: rule.name },
    });
    reply.code(201).send(toApprovalRuleDto(rule));
  });

  app.patch('/approval-rules/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const rule = await prisma.approvalRule.findUnique({ where: { id } });
    if (!rule) {
      reply.code(404).send({ error: 'Approval rule not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, rule.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    const body = request.body as
      | {
          name?: string;
          environmentId?: string | null;
          keyPattern?: string;
          actions?: ApprovalAction[];
          isActive?: boolean;
        }
      | undefined;
    const nextActions = Array.isArray(body?.actions) ? body?.actions : undefined;
    const hasEnvId = !!body && Object.prototype.hasOwnProperty.call(body, 'environmentId');
    const nextEnvId = hasEnvId ? body?.environmentId ?? null : undefined;
    if (nextEnvId) {
      const env = await prisma.environment.findUnique({ where: { id: nextEnvId } });
      if (!env || env.projectId !== rule.projectId) {
        reply.code(400).send({ error: 'Environment does not belong to project' });
        return;
      }
    }
    const updated = await prisma.approvalRule.update({
      where: { id },
      data: {
        name: body?.name?.trim() ?? undefined,
        environmentId: nextEnvId,
        keyPattern: body?.keyPattern?.trim() ?? undefined,
        actionsJson: nextActions ?? undefined,
        isActive: body?.isActive ?? undefined,
      },
    });
    await logAudit({
      projectId: rule.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.rule.update',
      resourceType: 'approval_rule',
      resourceId: id,
    });
    reply.send(toApprovalRuleDto(updated));
  });

  app.delete('/approval-rules/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const rule = await prisma.approvalRule.findUnique({ where: { id } });
    if (!rule) {
      reply.code(404).send({ error: 'Approval rule not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, rule.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    await prisma.approvalRule.delete({ where: { id } });
    await logAudit({
      projectId: rule.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.rule.delete',
      resourceType: 'approval_rule',
      resourceId: id,
    });
    reply.send({ ok: true });
  });

  app.get('/projects/:id/approvals', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const query = (request.query ?? {}) as {
      status?: ApprovalStatus;
      environmentId?: string;
      action?: ApprovalAction;
      requestedBy?: string;
    };
    const approvals = await prisma.approvalRequest.findMany({
      where: {
        projectId,
        status: query.status,
        environmentId: query.environmentId,
        action: query.action,
        requestedBy: query.requestedBy,
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(approvals.map(toApprovalRequestDto));
  });

  app.get('/approvals/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    let proposedValue: string | null = null;
    let currentValue: string | null = null;
    if (role === Role.ADMIN) {
      if (approval.payloadCiphertext && approval.payloadIv && approval.payloadTag) {
        proposedValue = decryptSecret(
          {
            ciphertext: approval.payloadCiphertext,
            iv: approval.payloadIv,
            tag: approval.payloadTag,
          },
          masterKey,
        );
      }
      if (approval.secretId) {
        const secret = await prisma.secret.findUnique({
          where: { id: approval.secretId },
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        const version = secret?.versions[0];
        if (version) {
          currentValue = decryptSecret(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            masterKey,
          );
        }
      }
    }
    reply.send(
      toApprovalRequestDto({
        ...approval,
        proposedValue,
        currentValue,
      }),
    );
  });

  app.post('/approvals/:id/approve', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      reply.code(409).send({ error: 'Approval request is not pending' });
      return;
    }

    const applied = await prisma.$transaction(async (tx) => {
      let resourceId: string | null = approval.secretId ?? null;
      let auditAction: string | null = null;
      let auditResourceType: string = 'secret';
      await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedBy: auth.user!.id,
          approvedAt: new Date(),
        },
      });

      const metadata = (approval.metadataJson as Record<string, unknown> | null) ?? null;
      if (
        metadata?.module === 'flags' &&
        metadata?.resourceType === 'feature_flag_env_override'
      ) {
        const flagId = typeof metadata.flagId === 'string' ? metadata.flagId : null;
        if (!flagId) {
          throw new Error('Missing flag metadata');
        }

        const flag = await tx.featureFlag.findFirst({
          where: { id: flagId, projectId: approval.projectId, deletedAt: null },
        });
        if (!flag) {
          throw new Error('Flag not found');
        }

        const environment = await tx.environment.findUnique({
          where: { id: approval.environmentId },
        });
        if (!environment || environment.projectId !== approval.projectId) {
          throw new Error('Environment not found');
        }

        const overrideEnabled =
          typeof metadata.overrideEnabled === 'boolean'
            ? metadata.overrideEnabled
            : metadata.overrideEnabled === null
              ? null
              : null;
        const variantId = typeof metadata.variantId === 'string' ? metadata.variantId : null;
        if (variantId) {
          const variant = await tx.featureFlagVariant.findFirst({
            where: { id: variantId, flagId: flag.id },
            select: { id: true },
          });
          if (!variant) {
            throw new Error('Invalid variant for flag override');
          }
        }

        if (approval.action === ApprovalAction.DELETE) {
          await tx.featureFlagEnvironmentOverride.deleteMany({
            where: { flagId: flag.id, environmentId: environment.id },
          });
          resourceId = `${flag.id}:${environment.id}`;
          auditAction = 'flag.override.delete';
          auditResourceType = 'feature_flag_env_override';
          return { resourceId, auditAction, auditResourceType };
        }

        const updated = await tx.featureFlagEnvironmentOverride.upsert({
          where: {
            flagId_environmentId: {
              flagId: flag.id,
              environmentId: environment.id,
            },
          },
          create: {
            flagId: flag.id,
            environmentId: environment.id,
            enabled: overrideEnabled,
            variantId,
          },
          update: {
            enabled: overrideEnabled,
            variantId,
          },
        });
        resourceId = updated.id;
        auditAction = 'flag.override.update';
        auditResourceType = 'feature_flag_env_override';
        return { resourceId, auditAction, auditResourceType };
      }

      if (metadata?.module === 'auth' && typeof metadata?.approvalKind === 'string') {
        const approvalKind = metadata.approvalKind;
        const asString = (value: unknown) =>
          typeof value === 'string' ? value.trim() : '';
        const asNumber = (value: unknown) =>
          typeof value === 'number' && Number.isFinite(value) ? value : undefined;
        const asBoolean = (value: unknown) =>
          typeof value === 'boolean' ? value : undefined;
        const asStringArray = (value: unknown) =>
          Array.isArray(value)
            ? value.filter((entry): entry is string => typeof entry === 'string')
            : undefined;

        if (approvalKind === 'config.update') {
          const updated = await tx.authProjectConfig.upsert({
            where: { projectId: approval.projectId },
            create: {
              projectId: approval.projectId,
              nativeAuthEnabled: asBoolean(metadata.nativeAuthEnabled) ?? true,
              emailPasswordEnabled: asBoolean(metadata.emailPasswordEnabled) ?? true,
              accessTokenTtlMinutes: asNumber(metadata.accessTokenTtlMinutes) ?? 15,
              refreshTokenTtlDays: asNumber(metadata.refreshTokenTtlDays) ?? 30,
            },
            update: {
              nativeAuthEnabled: asBoolean(metadata.nativeAuthEnabled),
              emailPasswordEnabled: asBoolean(metadata.emailPasswordEnabled),
              accessTokenTtlMinutes: asNumber(metadata.accessTokenTtlMinutes),
              refreshTokenTtlDays: asNumber(metadata.refreshTokenTtlDays),
            },
          });
          resourceId = updated.id;
          auditAction = 'auth.config.update';
          auditResourceType = 'auth_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'provider.upsert') {
          const provider = asString(metadata.provider).toUpperCase();
          const clientId = asString(metadata.clientId);
          const payloadCiphertext = approval.payloadCiphertext;
          const payloadIv = approval.payloadIv;
          const payloadTag = approval.payloadTag;
          if (
            (provider !== 'GOOGLE' && provider !== 'GITHUB') ||
            !clientId ||
            !payloadCiphertext ||
            !payloadIv ||
            !payloadTag
          ) {
            throw new Error('Invalid auth provider approval payload');
          }
          const providerConfig = await tx.authProviderConfig.upsert({
            where: {
              projectId_provider: {
                projectId: approval.projectId,
                provider: provider as AuthIdentityProvider,
              },
            },
            create: {
              projectId: approval.projectId,
              provider: provider as AuthIdentityProvider,
              enabled: asBoolean(metadata.enabled) ?? true,
              clientId,
              clientSecretCiphertext: payloadCiphertext,
              clientSecretIv: payloadIv,
              clientSecretTag: payloadTag,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
              scopesJson: asStringArray(metadata.scopes) ?? [],
            },
            update: {
              enabled: asBoolean(metadata.enabled) ?? undefined,
              clientId,
              clientSecretCiphertext: payloadCiphertext,
              clientSecretIv: payloadIv,
              clientSecretTag: payloadTag,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
              scopesJson: asStringArray(metadata.scopes) ?? undefined,
            },
          });
          resourceId = providerConfig.id;
          auditAction = 'auth.provider.upsert';
          auditResourceType = 'auth_provider_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'provider.update') {
          const providerId = asString(metadata.providerId);
          if (!providerId) {
            throw new Error('Missing providerId for approval');
          }
          const currentProvider = await tx.authProviderConfig.findUnique({
            where: { id: providerId },
          });
          if (!currentProvider || currentProvider.projectId !== approval.projectId) {
            throw new Error('Provider config not found');
          }
          const updated = await tx.authProviderConfig.update({
            where: { id: currentProvider.id },
            data: {
              enabled: asBoolean(metadata.enabled),
              clientId: asString(metadata.clientId) || undefined,
              scopesJson: asStringArray(metadata.scopes) ?? undefined,
            },
          });
          resourceId = updated.id;
          auditAction = 'auth.provider.update';
          auditResourceType = 'auth_provider_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'provider.rotate_secret') {
          const providerId = asString(metadata.providerId);
          const payloadCiphertext = approval.payloadCiphertext;
          const payloadIv = approval.payloadIv;
          const payloadTag = approval.payloadTag;
          if (!providerId || !payloadCiphertext || !payloadIv || !payloadTag) {
            throw new Error('Missing provider rotate payload');
          }
          const currentProvider = await tx.authProviderConfig.findUnique({
            where: { id: providerId },
          });
          if (!currentProvider || currentProvider.projectId !== approval.projectId) {
            throw new Error('Provider config not found');
          }
          const updated = await tx.authProviderConfig.update({
            where: { id: currentProvider.id },
            data: {
              clientSecretCiphertext: payloadCiphertext,
              clientSecretIv: payloadIv,
              clientSecretTag: payloadTag,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            },
          });
          resourceId = updated.id;
          auditAction = 'auth.provider.rotate_secret';
          auditResourceType = 'auth_provider_config';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'client.create') {
          const name = asString(metadata.name);
          const typeRaw = asString(metadata.type).toLowerCase();
          if (!name) {
            throw new Error('Missing client name for approval');
          }
          const type: AuthClientType =
            typeRaw === 'confidential' ? AuthClientType.CONFIDENTIAL : AuthClientType.PUBLIC;
          const redirectUris = asStringArray(metadata.redirectUris) ?? [];
          const clientId = `ac_${generateToken().slice(0, 24)}`;
          const rawSecret = type === AuthClientType.CONFIDENTIAL ? `acs_${generateToken()}` : null;
          const created = await tx.authClient.create({
            data: {
              projectId: approval.projectId,
              name,
              type,
              clientId,
              clientSecretHash: rawSecret ? hashToken(rawSecret) : null,
              redirectUrisJson: redirectUris,
            },
          });
          resourceId = created.id;
          auditAction = 'auth.client.create';
          auditResourceType = 'auth_client';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'client.update') {
          const clientRecordId = asString(metadata.clientId);
          if (!clientRecordId) {
            throw new Error('Missing clientId for approval');
          }
          const currentClient = await tx.authClient.findFirst({
            where: { id: clientRecordId, deletedAt: null },
          });
          if (!currentClient || currentClient.projectId !== approval.projectId) {
            throw new Error('Auth client not found');
          }
          const rotateSecret =
            asBoolean(metadata.rotateSecret) === true &&
            currentClient.type === AuthClientType.CONFIDENTIAL;
          const rawSecret = rotateSecret ? `acs_${generateToken()}` : null;
          const updated = await tx.authClient.update({
            where: { id: currentClient.id },
            data: {
              name: asString(metadata.name) || undefined,
              redirectUrisJson: asStringArray(metadata.redirectUris) ?? undefined,
              clientSecretHash: rawSecret ? hashToken(rawSecret) : undefined,
            },
          });
          resourceId = updated.id;
          auditAction = rotateSecret ? 'auth.client.rotate_secret' : 'auth.client.update';
          auditResourceType = 'auth_client';
          return { resourceId, auditAction, auditResourceType };
        }

        if (approvalKind === 'client.delete') {
          const clientRecordId = asString(metadata.clientId);
          if (!clientRecordId) {
            throw new Error('Missing clientId for approval');
          }
          const currentClient = await tx.authClient.findFirst({
            where: { id: clientRecordId, deletedAt: null },
          });
          if (!currentClient || currentClient.projectId !== approval.projectId) {
            throw new Error('Auth client not found');
          }
          await tx.authClient.update({
            where: { id: currentClient.id },
            data: { deletedAt: new Date() },
          });
          resourceId = currentClient.id;
          auditAction = 'auth.client.delete';
          auditResourceType = 'auth_client';
          return { resourceId, auditAction, auditResourceType };
        }
      }

      if (approval.action === ApprovalAction.CREATE) {
        const existing = await tx.secret.findMany({
          where: {
            environmentId: approval.environmentId,
            deletedAt: null,
          },
          select: { key: true },
        });
        const hasConflict = existing.some(
          (secret) => normalizeIdentifier(secret.key) === normalizeIdentifier(approval.key),
        );
        if (hasConflict) {
          throw new Error('Secret already exists');
        }
        if (!approval.payloadCiphertext || !approval.payloadIv || !approval.payloadTag) {
          throw new Error('Missing payload');
        }
        const secret = await tx.secret.create({
          data: {
            environmentId: approval.environmentId,
            key: approval.key,
          },
        });
        resourceId = secret.id;
        auditAction = 'secret.create';
        await tx.secretVersion.create({
          data: {
            secretId: secret.id,
            ciphertext: approval.payloadCiphertext,
            iv: approval.payloadIv,
            tag: approval.payloadTag,
            keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
      }

      if (approval.action === ApprovalAction.UPDATE) {
        if (!approval.secretId) {
          throw new Error('Missing secret');
        }
        const secret = await tx.secret.findUnique({
          where: { id: approval.secretId },
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        if (normalizeIdentifier(approval.key) !== normalizeIdentifier(secret.key)) {
          const siblings = await tx.secret.findMany({
            where: {
              environmentId: secret.environmentId,
              deletedAt: null,
            },
            select: { id: true, key: true },
          });
          const existing = siblings.find(
            (candidate) =>
              candidate.id !== secret.id &&
              normalizeIdentifier(candidate.key) === normalizeIdentifier(approval.key),
          );
          if (existing) {
            throw new Error('Key already exists in this environment');
          }
        }
        const payload = approval.payloadCiphertext
          ? {
              ciphertext: approval.payloadCiphertext,
              iv: approval.payloadIv!,
              tag: approval.payloadTag!,
              keyVersion: approval.payloadKeyVersion ?? masterKeyVersion(),
            }
          : null;
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        if (payload) {
          updates.push(
            tx.secretVersion.updateMany({
              where: { secretId: secret.id },
              data: { isActive: false },
            }),
            tx.secretVersion.create({
              data: {
                secretId: secret.id,
                ciphertext: payload.ciphertext,
                iv: payload.iv,
                tag: payload.tag,
                keyVersion: payload.keyVersion,
                createdBy: auth.user?.id,
                isActive: true,
              },
            }),
          );
        }
        updates.push(
          tx.secret.update({
            where: { id: secret.id },
            data: { key: approval.key, updatedAt: new Date(), deletedAt: null },
          }),
        );
        for (const update of updates) {
          await update;
        }
        auditAction = 'secret.update';
      }

      if (approval.action === ApprovalAction.DELETE) {
        if (!approval.secretId) {
          throw new Error('Missing secret');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          where: { id: approval.secretId },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        await tx.secret.update({
          where: { id: secret.id },
          data: { deletedAt: new Date() },
        });
        auditAction = 'secret.delete';
      }

      if (approval.action === ApprovalAction.ROLLBACK) {
        if (!approval.secretId || !approval.expectedVersionId) {
          throw new Error('Missing rollback version');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: { where: { id: approval.expectedVersionId } },
          },
          where: { id: approval.secretId },
        });
        if (!secret || secret.versions.length === 0) {
          throw new Error('Secret not found');
        }
        await tx.secretVersion.updateMany({
          where: { secretId: secret.id },
          data: { isActive: false },
        });
        await tx.secretVersion.update({
          where: { id: approval.expectedVersionId },
          data: { isActive: true },
        });
        await tx.secret.update({
          where: { id: secret.id },
          data: { updatedAt: new Date(), deletedAt: null },
        });
        auditAction = 'secret.rollback';
      }

      if (approval.action === ApprovalAction.COPY || approval.action === ApprovalAction.COPY_FROM) {
        if (!approval.secretId || !approval.targetEnvironmentId) {
          throw new Error('Missing copy target');
        }
        const targetEnv = await tx.environment.findUnique({
          where: { id: approval.targetEnvironmentId },
        });
        if (!targetEnv || targetEnv.projectId !== approval.projectId) {
          throw new Error('Target environment not found');
        }
        const secret = await tx.secret.findUnique({
          include: {
            versions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            environment: true,
          },
          where: { id: approval.secretId },
        });
        const version = secret?.versions[0];
        if (!secret || !version) {
          throw new Error('Secret not found');
        }
        if (approval.expectedVersionId && approval.expectedVersionId !== version.id) {
          throw new Error('Secret version conflict');
        }
        const value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
        const payload = encryptSecret(value, masterKey);
        const keyVersion = masterKeyVersion();
        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: {
              environmentId: approval.targetEnvironmentId,
              key: secret.key,
            },
          },
        });
        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const created = await tx.secret.create({
            data: {
              environmentId: approval.targetEnvironmentId,
              key: secret.key,
            },
          });
          targetSecretId = created.id;
        }
        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
        resourceId = targetSecretId;
        auditAction = 'secret.copy';
      }

      return { resourceId, auditAction, auditResourceType };
    });

    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.approved',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    if (applied.auditAction) {
      await logAudit({
        projectId: approval.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: applied.auditAction,
        resourceType: applied.auditResourceType,
        resourceId: applied.resourceId,
        metadataJson: {
          requestedBy: approval.requestedBy,
          action: approval.action,
          key: approval.key,
          environmentId: approval.environmentId,
          targetEnvironmentId: approval.targetEnvironmentId ?? undefined,
        },
      });
    }

    reply.send({ ok: true });
  });

  app.post('/approvals/:id/deny', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      reply.code(409).send({ error: 'Approval request is not pending' });
      return;
    }
    await prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.DENIED, deniedAt: new Date() },
    });
    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.denied',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    reply.send({ ok: true });
  });

  app.post('/approvals/:id/cancel', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const approval = await prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) {
      reply.code(404).send({ error: 'Approval request not found' });
      return;
    }
    const role = await requireProjectRole(request, reply, approval.projectId, Role.VIEWER);
    if (!role) {
      return;
    }
    const isRequester = approval.requestedBy === auth.user!.id;
    const isAdmin = role === Role.ADMIN;
    if (!isRequester && !isAdmin) {
      forbidden(reply);
      return;
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      reply.code(409).send({ error: 'Approval request is not pending' });
      return;
    }
    await prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.CANCELED, canceledAt: new Date() },
    });
    await logAudit({
      projectId: approval.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'approval.canceled',
      resourceType: 'approval_request',
      resourceId: approval.id,
      metadataJson: { requestedBy: approval.requestedBy, action: approval.action },
    });
    reply.send({ ok: true });
  });

  app.post('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (request.auth?.tokenScopeType === 'service_account') {
      reply.code(403).send({ error: 'Service account tokens cannot create environments' });
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const body = request.body as { name?: string; copyFromEnvironmentId?: string | null } | undefined;
    if (!body?.name) {
      reply.code(400).send({ error: 'Name is required' });
      return;
    }

    const copyFromId = body.copyFromEnvironmentId?.trim();
    let sourceEnv: { id: string; projectId: string } | null = null;
    if (copyFromId) {
      sourceEnv = await prisma.environment.findFirst({
        where: { id: copyFromId, projectId },
        select: { id: true, projectId: true },
      });
      if (!sourceEnv) {
        reply.code(400).send({ error: 'Source environment not found' });
        return;
      }
    }

    const slug = await ensureUniqueEnvironmentSlug(projectId, body.name);
    let env;
    try {
      env = await prisma.environment.create({
        data: {
          projectId,
          name: body.name,
          slug,
        },
      });
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        reply.code(409).send({ error: 'Environment name already exists in this project' });
        return;
      }
      throw error;
    }

    let copiedCount = 0;
    if (sourceEnv) {
      const secrets = await prisma.secret.findMany({
        where: { environmentId: sourceEnv.id, deletedAt: null },
        include: {
          versions: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { key: 'asc' },
      });

      if (secrets.length > 0) {
        const operations: Prisma.PrismaPromise<unknown>[] = [];
        for (const secret of secrets) {
          const version = secret.versions[0];
          if (!version) {
            operations.push(
              prisma.secret.create({
                data: {
                  environmentId: env.id,
                  key: secret.key,
                },
              }),
            );
            continue;
          }

          const value = decryptSecret(
            { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
            masterKey,
          );
          const payload = encryptSecret(value, masterKey);
          const keyVersion = masterKeyVersion();

          operations.push(
            prisma.secret.create({
              data: {
                environmentId: env.id,
                key: secret.key,
                versions: {
                  create: {
                    ciphertext: payload.ciphertext,
                    iv: payload.iv,
                    tag: payload.tag,
                    keyVersion,
                    createdBy: auth.user?.id,
                    isActive: true,
                  },
                },
              },
            }),
          );
        }

        await prisma.$transaction(operations);
        copiedCount = secrets.length;
      }
    }

    await logAudit({
      projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'environment.create',
      resourceType: 'environment',
      resourceId: env.id,
      metadataJson: sourceEnv
        ? { copyFromEnvironmentId: sourceEnv.id, copiedSecrets: copiedCount }
        : null,
    });

    reply.code(201).send(toEnvironmentDto(env));
  });

  app.get('/projects/:id/environments', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId } = request.params as { id: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const scopedEnvIds = request.auth?.scopeEnvironmentIds;
    const envs = await prisma.environment.findMany({
      where: {
        projectId,
        ...(request.auth?.viaToken && scopedEnvIds ? { id: { in: scopedEnvIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(envs.map(toEnvironmentDto));
  });

  app.get('/projects/:id/environments/slug/:slug', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, slug } = request.params as { id: string; slug: string };
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const env = await prisma.environment.findFirst({
      where: { projectId, slug },
    });

    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, env.id)) {
      return;
    }

    reply.send(toEnvironmentDto(env));
  });

  app.delete('/projects/:id/environments/:environmentId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: projectId, environmentId } = request.params as { id: string; environmentId: string };
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | { confirmText?: string; forceLastEnvironment?: boolean }
      | undefined;
    if (!body?.confirmText?.trim()) {
      reply.code(400).send({ error: 'confirmText is required' });
      return;
    }

    const result = await deleteEnvironmentWithGuards({
      projectId,
      environmentId,
      confirmText: body.confirmText,
      forceLastEnvironment: body.forceLastEnvironment === true,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
    });

    if (!result.ok) {
      reply.code(result.status).send({ error: result.error });
      return;
    }

    reply.send({ ok: true });
  });

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
        reply.code(403).send({ error: 'Token does not have access to this environment' });
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
      reply.code(404).send({ error: 'Environment not found' });
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

  app.post('/environments/:id/secrets', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string } | undefined;
    const key = body?.key?.trim();
    const value = body?.value;
    if (!key || value === undefined) {
      reply.code(400).send({ error: 'Key and value are required' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const matchingRules = await findMatchingApprovalRules({
      projectId: env.projectId,
      environmentId: envId,
      action: ApprovalAction.CREATE,
      key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: env.projectId,
        environmentId: envId,
        action: ApprovalAction.CREATE,
        key,
        secretId: null,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const payload = encryptSecret(value, masterKey);
      const keyVersion = masterKeyVersion();
      const approval = await createApprovalRequest({
        projectId: env.projectId,
        environmentId: envId,
        action: ApprovalAction.CREATE,
        key,
        requestedBy: auth.user!.id,
        payload: { ...payload, keyVersion },
      });
      await logAudit({
        projectId: env.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'CREATE', key, environmentId: envId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    const payload = encryptSecret(value, masterKey);
    const keyVersion = masterKeyVersion();

    const siblingSecrets = await prisma.secret.findMany({
      where: { environmentId: envId, deletedAt: null },
      select: { id: true, key: true },
    });
    const hasConflict = siblingSecrets.some(
      (sibling) => normalizeIdentifier(sibling.key) === normalizeIdentifier(key),
    );
    if (hasConflict) {
      reply.code(409).send({ error: 'Key already exists in this environment' });
      return;
    }

    const existing = await prisma.secret.findUnique({
      where: { environmentId_key: { environmentId: envId, key } },
    });

    let secretId = existing?.id;
    if (!secretId) {
      try {
        const secret = await prisma.secret.create({
          data: {
            environmentId: envId,
            key,
          },
        });
        secretId = secret.id;
      } catch (error) {
        if (isPrismaUniqueError(error)) {
          reply.code(409).send({ error: 'Key already exists in this environment' });
          return;
        }
        throw error;
      }
    }

    await prisma.$transaction([
      prisma.secretVersion.updateMany({
        where: { secretId },
        data: { isActive: false },
      }),
      prisma.secretVersion.create({
        data: {
          secretId,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          tag: payload.tag,
          keyVersion,
          createdBy: auth.user?.id,
          isActive: true,
        },
      }),
      prisma.secret.update({
        where: { id: secretId },
        data: { updatedAt: new Date(), deletedAt: null },
      }),
    ]);

    await logAudit({
      projectId: env.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.create',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: { key, environmentId: envId },
    });

    reply.code(201).send({ id: secretId });
  });

  app.post('/environments/:id/secrets/bulk', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const body = request.body as
      | { entries?: { key?: string; value?: string }[]; overwrite?: boolean }
      | undefined;

    const entries = body?.entries ?? [];
    if (entries.length === 0) {
      reply.code(400).send({ error: 'Entries are required' });
      return;
    }
    if (entries.length > 500) {
      reply.code(400).send({ error: 'Too many entries (max 500).' });
      return;
    }

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      reply.code(404).send({ error: 'Environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, envId)) {
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const deduped = new Map<string, string>();
    for (const entry of entries) {
      const key = typeof entry.key === 'string' ? entry.key.trim() : '';
      const value = typeof entry.value === 'string' ? entry.value : undefined;
      if (!key || value === undefined) {
        reply.code(400).send({ error: 'Each entry must include key and value' });
        return;
      }
      deduped.set(key, value);
    }

    const keys = Array.from(deduped.keys());
    if (keys.length === 0) {
      reply.code(400).send({ error: 'Entries are required' });
      return;
    }

    const existingSecrets = await prisma.secret.findMany({
      where: { environmentId: envId, key: { in: keys } },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const existingByKey = new Map(existingSecrets.map((secret) => [secret.key, secret]));
    const activeByKey = new Map(
      existingSecrets
        .filter((secret) => secret.deletedAt === null)
        .map((secret) => [secret.key, secret]),
    );

    const overwrite = Boolean(body?.overwrite);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let pending = 0;
    const approvalRequestIds: string[] = [];

    for (const [key, value] of deduped.entries()) {
      const active = activeByKey.get(key);
      const existing = existingByKey.get(key);
      if (active && !overwrite) {
        skipped += 1;
        continue;
      }

      const isCreate = !existing;
      const action = isCreate ? ApprovalAction.CREATE : ApprovalAction.UPDATE;

      const matchingRules = await findMatchingApprovalRules({
        projectId: env.projectId,
        environmentId: envId,
        action,
        key,
      });
      if (matchingRules.length > 0) {
        if (!requireUserForApproval(request, reply)) {
          return;
        }
        const existingApproval = await findPendingApprovalRequest({
          projectId: env.projectId,
          environmentId: envId,
          action,
          key,
          secretId: isCreate ? null : existing?.id ?? null,
        });
        if (existingApproval) {
          pending += 1;
          approvalRequestIds.push(existingApproval.id);
          continue;
        }
        const encrypted = encryptSecret(value, masterKey);
        const keyVersion = masterKeyVersion();
        const approval = await createApprovalRequest({
          projectId: env.projectId,
          environmentId: envId,
          action,
          key,
          requestedBy: auth.user!.id,
          secretId: isCreate ? undefined : existing?.id,
          expectedVersionId: isCreate ? undefined : existing?.versions[0]?.id,
          payload: { ...encrypted, keyVersion },
        });
        await logAudit({
          projectId: env.projectId,
          actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
          action: 'approval.requested',
          resourceType: 'approval_request',
          resourceId: approval.id,
          metadataJson: {
            action: action === ApprovalAction.CREATE ? 'CREATE' : 'UPDATE',
            key,
            environmentId: envId,
            secretId: existing?.id,
          },
        });
        pending += 1;
        approvalRequestIds.push(approval.id);
        continue;
      }

      const payload = encryptSecret(value, masterKey);
      const keyVersion = masterKeyVersion();

      let secretId = existing?.id;
      if (!secretId) {
        const secret = await prisma.secret.create({
          data: {
            environmentId: envId,
            key,
          },
        });
        secretId = secret.id;
      }

      await prisma.$transaction([
        prisma.secretVersion.updateMany({
          where: { secretId },
          data: { isActive: false },
        }),
        prisma.secretVersion.create({
          data: {
            secretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        }),
        prisma.secret.update({
          where: { id: secretId },
          data: { updatedAt: new Date(), deletedAt: null },
        }),
      ]);

      await logAudit({
        projectId: env.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: isCreate ? 'secret.create' : 'secret.update',
        resourceType: 'secret',
        resourceId: secretId,
        metadataJson: { key, environmentId: envId },
      });

      if (isCreate) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    reply.send({ created, updated, skipped, pending, approvalRequestIds });
  });

  app.patch('/secrets/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string } | undefined;
    const nextKeyRaw = typeof body?.key === 'string' ? body?.key : undefined;
    const nextValueRaw = typeof body?.value === 'string' ? body?.value : undefined;
    const nextKey = nextKeyRaw?.trim();
    const nextValue = nextValueRaw?.trim();
    if (nextKeyRaw === undefined && nextValueRaw === undefined) {
      reply.code(400).send({ error: 'Key or value is required' });
      return;
    }
    if (nextKeyRaw !== undefined && !nextKey) {
      reply.code(400).send({ error: 'Key is required' });
      return;
    }
    if (nextValueRaw !== undefined && !nextValue) {
      reply.code(400).send({ error: 'Value is required' });
      return;
    }

    const secret = await prisma.secret.findUnique({
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, secret.environmentId)) {
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

    const activeVersion = secret.versions[0];
    const requestedKey = nextKey ?? secret.key;
    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.UPDATE,
      key: requestedKey,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.UPDATE,
        key: requestedKey,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      let payload:
        | { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; tag: Uint8Array<ArrayBuffer>; keyVersion: string }
        | null = null;
      if (nextValue) {
        const encrypted = encryptSecret(nextValue, masterKey);
        payload = { ...encrypted, keyVersion: masterKeyVersion() };
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.UPDATE,
        key: requestedKey,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: activeVersion?.id,
        payload,
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'UPDATE', key: requestedKey, secretId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    const keyChanged = nextKey && nextKey !== secret.key;
    const normalizedKeyChanged =
      nextKey && normalizeIdentifier(nextKey) !== normalizeIdentifier(secret.key);
    if (normalizedKeyChanged && nextKey) {
      const siblings = await prisma.secret.findMany({
        where: { environmentId: secret.environmentId, deletedAt: null },
        select: { id: true, key: true },
      });
      const existing = siblings.find(
        (candidate) =>
          candidate.id !== secretId &&
          normalizeIdentifier(candidate.key) === normalizeIdentifier(nextKey),
      );
      if (existing) {
        reply.code(409).send({ error: 'Key already exists in this environment' });
        return;
      }
    }

    const updateData: { key?: string; updatedAt: Date; deletedAt: null } = {
      updatedAt: new Date(),
      deletedAt: null,
    };
    if (keyChanged && nextKey) {
      updateData.key = nextKey;
    }

    const transactionOps = [];
    const valueChanged = nextValueRaw !== undefined;
    if (valueChanged && nextValue) {
      const payload = encryptSecret(nextValue, masterKey);
      const keyVersion = masterKeyVersion();
      transactionOps.push(
        prisma.secretVersion.updateMany({
          where: { secretId },
          data: { isActive: false },
        }),
        prisma.secretVersion.create({
          data: {
            secretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        }),
      );
    }
    transactionOps.push(
      prisma.secret.update({
        where: { id: secretId },
        data: updateData,
      }),
    );

    await prisma.$transaction(transactionOps);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.update',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: {
        previousKey: secret.key,
        updatedKey: keyChanged ? nextKey : secret.key,
        updatedValue: valueChanged,
      },
    });

    reply.send({ ok: true });
  });

  app.post('/secrets/:id/copy', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as
      | { targetEnvironmentIds?: string[]; overwrite?: boolean }
      | undefined;
    const rawTargets = body?.targetEnvironmentIds?.filter((id) => id.trim().length > 0) ?? [];
    const targetIds = Array.from(new Set(rawTargets));
    if (targetIds.length === 0) {
      reply.code(400).send({ error: 'Target environments are required' });
      return;
    }

    const secret = await prisma.secret.findUnique({
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
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

    const activeVersion = secret.versions[0];
    if (!activeVersion) {
      reply.code(400).send({ error: 'Secret has no active version' });
      return;
    }

    const targetIdsWithoutSource = targetIds.filter((id) => id !== secret.environmentId);
    if (targetIdsWithoutSource.length === 0) {
      reply.code(400).send({ error: 'No target environments provided' });
      return;
    }

    const targetEnvs = await prisma.environment.findMany({
      where: { id: { in: targetIdsWithoutSource } },
    });
    if (targetEnvs.length !== targetIdsWithoutSource.length) {
      reply.code(404).send({ error: 'One or more environments not found' });
      return;
    }

    if (targetEnvs.some((env) => env.projectId !== secret.environment.projectId)) {
      reply.code(400).send({ error: 'Targets must belong to the same project' });
      return;
    }

    const approvalRequestIds: string[] = [];
    for (const targetEnv of targetEnvs) {
      const rules = await findMatchingApprovalRules({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
      });
      if (rules.length === 0) {
        continue;
      }
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
        secretId: secretId,
        targetEnvironmentId: targetEnv.id,
      });
      if (existing) {
        approvalRequestIds.push(existing.id);
        continue;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        targetEnvironmentId: targetEnv.id,
        expectedVersionId: activeVersion.id,
      });
      approvalRequestIds.push(approval.id);
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          action: 'COPY',
          key: secret.key,
          secretId,
          targetEnvironmentId: targetEnv.id,
        },
      });
    }
    if (approvalRequestIds.length > 0) {
      reply.code(202).send({ status: 'pending', approvalRequestIds });
      return;
    }

    const value = decryptSecret(
      { ciphertext: activeVersion.ciphertext, iv: activeVersion.iv, tag: activeVersion.tag },
      masterKey,
    );
    const keyVersion = masterKeyVersion();
    const overwrite = body?.overwrite === true;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const env of targetEnvs) {
        const existing = await tx.secret.findUnique({
          where: { environmentId_key: { environmentId: env.id, key: secret.key } },
        });

        if (existing && !overwrite) {
          skipped.push(env.id);
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const createdSecret = await tx.secret.create({
            data: { environmentId: env.id, key: secret.key },
          });
          targetSecretId = createdSecret.id;
          created.push(env.id);
        } else {
          updated.push(env.id);
        }

        const payload = encryptSecret(value, masterKey);

        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
      }
    });

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.copy',
      resourceType: 'secret',
      resourceId: secret.id,
      metadataJson: {
        key: secret.key,
        sourceEnvironmentId: secret.environmentId,
        targetEnvironmentIds: targetIdsWithoutSource,
        overwrite,
        created,
        updated,
        skipped,
      },
    });

    reply.send({ created, updated, skipped });
  });

  app.post('/environments/:id/secrets/copy-from', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: targetEnvId } = request.params as { id: string };
    const body = request.body as
      | { sourceEnvironmentId?: string; keys?: string[]; overwrite?: boolean }
      | undefined;

    const sourceEnvironmentId = body?.sourceEnvironmentId?.trim();
    if (!sourceEnvironmentId) {
      reply.code(400).send({ error: 'Source environment is required' });
      return;
    }

    const targetEnv = await prisma.environment.findUnique({ where: { id: targetEnvId } });
    if (!targetEnv) {
      reply.code(404).send({ error: 'Target environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, targetEnvId)) {
      return;
    }

    const sourceEnv = await prisma.environment.findUnique({ where: { id: sourceEnvironmentId } });
    if (!sourceEnv) {
      reply.code(404).send({ error: 'Source environment not found' });
      return;
    }
    if (!requireEnvironmentScope(request, reply, sourceEnvironmentId)) {
      return;
    }

    if (sourceEnv.projectId !== targetEnv.projectId) {
      reply.code(400).send({ error: 'Source and target must belong to the same project' });
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      targetEnv.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const overwrite = body?.overwrite === true;
    const keys = body?.keys?.filter((key) => key.trim().length > 0);

    const sourceSecrets = await prisma.secret.findMany({
      where: {
        environmentId: sourceEnv.id,
        deletedAt: null,
        ...(keys?.length ? { key: { in: keys } } : {}),
      },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    if (sourceSecrets.length === 0) {
      const skippedDetails =
        keys?.length
          ? keys.map((key) => ({
              key,
              reason: 'Source environment does not contain this key.',
              code: 'SOURCE_MISSING',
            }))
          : [];
      reply.send({ created: [], updated: [], skipped: keys ?? [], skippedDetails });
      return;
    }

    const approvalRequestIds: string[] = [];
    for (const sourceSecret of sourceSecrets) {
      const rules = await findMatchingApprovalRules({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
      });
      if (rules.length === 0) {
        continue;
      }
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const version = sourceSecret.versions[0];
      const existing = await findPendingApprovalRequest({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
        secretId: sourceSecret.id,
        targetEnvironmentId: targetEnv.id,
      });
      if (existing) {
        approvalRequestIds.push(existing.id);
        continue;
      }
      const approval = await createApprovalRequest({
        projectId: targetEnv.projectId,
        environmentId: targetEnv.id,
        action: ApprovalAction.COPY_FROM,
        key: sourceSecret.key,
        requestedBy: auth.user!.id,
        secretId: sourceSecret.id,
        targetEnvironmentId: targetEnv.id,
        expectedVersionId: version?.id,
        metadataJson: { sourceEnvironmentId: sourceEnv.id, overwrite },
      });
      approvalRequestIds.push(approval.id);
      await logAudit({
        projectId: targetEnv.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: {
          action: 'COPY_FROM',
          key: sourceSecret.key,
          secretId: sourceSecret.id,
          targetEnvironmentId: targetEnv.id,
          sourceEnvironmentId: sourceEnv.id,
        },
      });
    }
    if (approvalRequestIds.length > 0) {
      reply.code(202).send({ status: 'pending', approvalRequestIds });
      return;
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const skippedDetails: { key: string; reason: string; code: string }[] = [];
    const keyVersion = masterKeyVersion();

    const requestedKeys = keys?.length ? new Set(keys) : null;
    if (requestedKeys) {
      const foundKeys = new Set(sourceSecrets.map((secret) => secret.key));
      for (const key of requestedKeys) {
        if (!foundKeys.has(key)) {
          skipped.push(key);
          skippedDetails.push({
            key,
            reason: 'Source environment does not contain this key.',
            code: 'SOURCE_MISSING',
          });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const sourceSecret of sourceSecrets) {
        const version = sourceSecret.versions[0];
        if (!version) {
          skipped.push(sourceSecret.key);
          skippedDetails.push({
            key: sourceSecret.key,
            reason: 'Source secret does not have an active version.',
            code: 'SOURCE_NO_VERSION',
          });
          continue;
        }

        const existing = await tx.secret.findUnique({
          where: {
            environmentId_key: { environmentId: targetEnv.id, key: sourceSecret.key },
          },
        });

        if (existing && !overwrite) {
          skipped.push(sourceSecret.key);
          if (existing.deletedAt) {
            skippedDetails.push({
              key: sourceSecret.key,
              reason: 'Key was deleted but is still reserved. Use overwrite to restore.',
              code: 'TARGET_SOFT_DELETED',
            });
          } else {
            skippedDetails.push({
              key: sourceSecret.key,
              reason: 'Target environment already has this key.',
              code: 'TARGET_EXISTS',
            });
          }
          continue;
        }

        let targetSecretId = existing?.id;
        if (!targetSecretId) {
          const createdSecret = await tx.secret.create({
            data: { environmentId: targetEnv.id, key: sourceSecret.key },
          });
          targetSecretId = createdSecret.id;
          created.push(sourceSecret.key);
        } else {
          updated.push(sourceSecret.key);
        }

        const value = decryptSecret(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          masterKey,
        );
        const payload = encryptSecret(value, masterKey);

        await tx.secretVersion.updateMany({
          where: { secretId: targetSecretId },
          data: { isActive: false },
        });
        await tx.secretVersion.create({
          data: {
            secretId: targetSecretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        });
        await tx.secret.update({
          where: { id: targetSecretId },
          data: { updatedAt: new Date(), deletedAt: null },
        });
      }
    });

    await logAudit({
      projectId: targetEnv.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.copy.bulk',
      resourceType: 'secret',
      metadataJson: {
        sourceEnvironmentId: sourceEnv.id,
        targetEnvironmentId: targetEnv.id,
        overwrite,
        created,
        updated,
        skipped,
      },
    });

    reply.send({ created, updated, skipped, skippedDetails });
  });

  app.post('/secrets/:id/rollback', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const body = request.body as { versionId?: string } | undefined;

    const secret = await prisma.secret.findUnique({
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
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
    });

    if (versions.length < 2 && !body?.versionId) {
      reply.code(400).send({ error: 'No previous version to rollback' });
      return;
    }

    const target = body?.versionId ? versions.find((v) => v.id === body.versionId) : versions[1];

    if (!target) {
      reply.code(404).send({ error: 'Version not found' });
      return;
    }

    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.ROLLBACK,
      key: secret.key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.ROLLBACK,
        key: secret.key,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.ROLLBACK,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: target.id,
        metadataJson: { versionId: target.id },
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'ROLLBACK', key: secret.key, secretId, versionId: target.id },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    await prisma.$transaction([
      prisma.secretVersion.updateMany({ where: { secretId }, data: { isActive: false } }),
      prisma.secretVersion.update({ where: { id: target.id }, data: { isActive: true } }),
    ]);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.rollback',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: { versionId: target.id },
    });

    reply.send({ ok: true });
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
      reply.code(404).send({ error: 'Secret not found' });
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
      reply.code(400).send({ error: 'Not enough versions to diff' });
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
      reply.code(404).send({ error: 'Secret not found' });
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
      reply.code(400).send({ error: 'secretId is required' });
      return;
    }

    const secret = await prisma.secret.findUnique({
      include: { environment: true },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
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
        reply.code(400).send({ error: 'Invalid version ids for diff' });
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
        reply.code(400).send({ error: 'Not enough versions to diff' });
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

  app.delete('/secrets/:id', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: secretId } = request.params as { id: string };
    const secret = await prisma.secret.findUnique({
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      where: { id: secretId },
    });
    if (!secret) {
      reply.code(404).send({ error: 'Secret not found' });
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

    const activeVersion = secret.versions[0];
    const matchingRules = await findMatchingApprovalRules({
      projectId: secret.environment.projectId,
      environmentId: secret.environmentId,
      action: ApprovalAction.DELETE,
      key: secret.key,
    });
    if (matchingRules.length > 0) {
      if (!requireUserForApproval(request, reply)) {
        return;
      }
      const existing = await findPendingApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.DELETE,
        key: secret.key,
        secretId: secretId,
      });
      if (existing) {
        reply.code(202).send({ status: 'pending', approvalRequestId: existing.id });
        return;
      }
      const approval = await createApprovalRequest({
        projectId: secret.environment.projectId,
        environmentId: secret.environmentId,
        action: ApprovalAction.DELETE,
        key: secret.key,
        requestedBy: auth.user!.id,
        secretId: secretId,
        expectedVersionId: activeVersion?.id,
      });
      await logAudit({
        projectId: secret.environment.projectId,
        actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: approval.id,
        metadataJson: { action: 'DELETE', key: secret.key, secretId },
      });
      reply.code(202).send({ status: 'pending', approvalRequestId: approval.id });
      return;
    }

    await prisma.secret.update({
      where: { id: secretId },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.delete',
      resourceType: 'secret',
      resourceId: secretId,
    });

    reply.send({ ok: true });
  });

  let auditCleanupRunning = false;
  const runAuditRetentionCleanup = async () => {
    if (auditCleanupRunning) {
      return;
    }
    auditCleanupRunning = true;
    try {
      const projects = await prisma.project.findMany({
        where: { auditRetentionDays: { not: null } },
        select: { id: true, auditRetentionDays: true },
      });

      const now = new Date();
      for (const project of projects) {
        if (project.auditRetentionDays === null) continue;
        const cutoff = new Date(
          now.getTime() - project.auditRetentionDays * 24 * 60 * 60 * 1000,
        );
        const result = await prisma.auditLog.deleteMany({
          where: { projectId: project.id, createdAt: { lt: cutoff } },
        });
        if (result.count > 0) {
          app.log.info(
            {
              projectId: project.id,
              deleted: result.count,
              cutoff: cutoff.toISOString(),
            },
            'audit retention cleanup',
          );
        }
      }
    } catch (error) {
      await logDispatcher.emit({
        event: 'audit.cleanup.failed',
        level: 'error',
        category: 'internal',
        message: 'audit retention cleanup failed',
        err: error,
      });
    } finally {
      auditCleanupRunning = false;
    }
  };

  setTimeout(() => {
    void runAuditRetentionCleanup();
  }, 60 * 1000);
  setInterval(() => {
    void runAuditRetentionCleanup();
  }, 24 * 60 * 60 * 1000);

  return app;
}
