import type { ApprovalAction, ApprovalStatus, Prisma } from '@prisma/client';

export function toApprovalRuleDto(rule: {
  id: string;
  projectId: string;
  name: string;
  environmentId: string | null;
  keyPattern: string;
  actionsJson: Prisma.JsonValue;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const actions = Array.isArray(rule.actionsJson) ? rule.actionsJson : [];
  return {
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    environmentId: rule.environmentId,
    keyPattern: rule.keyPattern,
    actions,
    isActive: rule.isActive,
    createdBy: rule.createdBy,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toApprovalRequestDto(request: {
  id: string;
  projectId: string;
  environmentId: string;
  secretId: string | null;
  action: ApprovalAction;
  status: ApprovalStatus;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  deniedAt: Date | null;
  canceledAt: Date | null;
  key: string;
  targetEnvironmentId: string | null;
  expectedVersionId: string | null;
  metadataJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  proposedValue?: string | null;
  currentValue?: string | null;
}) {
  return {
    id: request.id,
    projectId: request.projectId,
    environmentId: request.environmentId,
    secretId: request.secretId,
    action: request.action,
    status: request.status,
    requestedBy: request.requestedBy,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt?.toISOString() ?? null,
    deniedAt: request.deniedAt?.toISOString() ?? null,
    canceledAt: request.canceledAt?.toISOString() ?? null,
    key: request.key,
    targetEnvironmentId: request.targetEnvironmentId,
    expectedVersionId: request.expectedVersionId,
    metadataJson: request.metadataJson as Record<string, unknown> | null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    proposedValue: request.proposedValue ?? undefined,
    currentValue: request.currentValue ?? undefined,
  };
}
