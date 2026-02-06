import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

export async function logAudit(params: {
  projectId: string;
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  await prisma.auditLog.create({
    data: {
      projectId: params.projectId,
      actorUserId: params.actorUserId ?? null,
      actorServiceAccountId: params.actorServiceAccountId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadataJson: (params.metadataJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
