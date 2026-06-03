import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { normalizeIdentifier } from './identifiers.js';

type ActorContext = {
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
};

type RenameFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
};

type RenameSuccess = {
  ok: true;
  project: {
    id: string;
    organizationId: string | null;
    name: string;
    slug: string | null;
    auditRetentionDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

export async function renameProjectWithGuards(params: {
  projectId: string;
  nextName: string;
  actorUserId: string;
} & ActorContext): Promise<RenameFailure | RenameSuccess> {
  const nextName = params.nextName.trim();
  if (!nextName) {
    return { ok: false, status: 400, error: 'Name is required' };
  }

  const existing = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { name: true },
  });
  if (!existing) {
    return { ok: false, status: 404, error: 'Project not found' };
  }

  if (existing.name !== nextName) {
    const conflicts = await prisma.projectMember.findMany({
      where: { userId: params.actorUserId, NOT: { projectId: params.projectId } },
      select: { project: { select: { name: true } } },
    });
    const conflict = conflicts.some(
      (membership) =>
        normalizeIdentifier(membership.project.name) ===
        normalizeIdentifier(nextName),
    );
    if (conflict) {
      return { ok: false, status: 409, error: 'Project name already exists' };
    }
  }

  const project = await prisma.project.update({
    where: { id: params.projectId },
    data: { name: nextName },
  });

  await prisma.auditLog.create({
    data: {
      projectId: params.projectId,
      actorUserId: params.actorUserId ?? null,
      actorServiceAccountId: params.actorServiceAccountId ?? null,
      action: 'project.update',
      resourceType: 'project',
      resourceId: params.projectId,
      metadataJson: {
        oldName: existing.name,
        newName: project.name,
      } as Prisma.InputJsonValue,
    },
  });

  return { ok: true, project };
}
