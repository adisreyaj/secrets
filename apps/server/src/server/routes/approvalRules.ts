import { ApprovalAction, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { toApprovalRuleDto } from '../mappers/approvals.js';
import { logAudit } from '../services/audit.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
      sendError(reply, 400, 'Name, keyPattern, and actions are required');
      return;
    }
    if (body.environmentId) {
      const env = await prisma.environment.findUnique({ where: { id: body.environmentId } });
      if (!env || env.projectId !== projectId) {
        sendError(reply, 400, 'Environment does not belong to project');
        return;
      }
    }
    if (!auth.user) {
      sendError(reply, 403, 'Approval rules require a user session');
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
      sendError(reply, 404, 'Approval rule not found');
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
        sendError(reply, 400, 'Environment does not belong to project');
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
      sendError(reply, 404, 'Approval rule not found');
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
}
