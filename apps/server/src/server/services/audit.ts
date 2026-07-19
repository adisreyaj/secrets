import { auditLogs, db } from '../../db/index.js';

export async function logAudit(params: {
  projectId: string;
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  await db.insert(auditLogs).values({
    projectId: params.projectId,
    actorUserId: params.actorUserId ?? null,
    actorServiceAccountId: params.actorServiceAccountId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadataJson: params.metadataJson ?? null,
  });
}
