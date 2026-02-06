import { ApprovalStatus, type ApprovalAction, type Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
  return new RegExp(regex, 'i');
}

function actionsMatch(actionsJson: Prisma.JsonValue, action: ApprovalAction): boolean {
  if (!Array.isArray(actionsJson)) return false;
  return actionsJson.includes(action);
}

export async function findMatchingApprovalRules(params: {
  projectId: string;
  environmentId: string;
  action: ApprovalAction;
  key: string;
}) {
  const rules = await prisma.approvalRule.findMany({
    where: {
      projectId: params.projectId,
      isActive: true,
      OR: [{ environmentId: null }, { environmentId: params.environmentId }],
    },
  });

  return rules.filter((rule) => {
    if (!actionsMatch(rule.actionsJson, params.action)) return false;
    const matcher = globToRegExp(rule.keyPattern);
    return matcher.test(params.key);
  });
}

export async function findPendingApprovalRequest(params: {
  projectId: string;
  environmentId: string;
  action: ApprovalAction;
  key: string;
  secretId?: string | null;
  targetEnvironmentId?: string | null;
}) {
  return prisma.approvalRequest.findFirst({
    where: {
      projectId: params.projectId,
      environmentId: params.environmentId,
      action: params.action,
      key: params.key,
      secretId: params.secretId ?? null,
      targetEnvironmentId: params.targetEnvironmentId ?? null,
      status: ApprovalStatus.PENDING,
    },
  });
}

export async function createApprovalRequest(params: {
  projectId: string;
  environmentId: string;
  action: ApprovalAction;
  key: string;
  requestedBy: string;
  secretId?: string | null;
  targetEnvironmentId?: string | null;
  expectedVersionId?: string | null;
  payload?: {
    ciphertext: Uint8Array<ArrayBuffer>;
    iv: Uint8Array<ArrayBuffer>;
    tag: Uint8Array<ArrayBuffer>;
    keyVersion: string;
  } | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  return prisma.approvalRequest.create({
    data: {
      projectId: params.projectId,
      environmentId: params.environmentId,
      secretId: params.secretId ?? null,
      action: params.action,
      status: ApprovalStatus.PENDING,
      requestedBy: params.requestedBy,
      key: params.key,
      targetEnvironmentId: params.targetEnvironmentId ?? null,
      expectedVersionId: params.expectedVersionId ?? null,
      payloadCiphertext: params.payload?.ciphertext,
      payloadIv: params.payload?.iv,
      payloadTag: params.payload?.tag,
      payloadKeyVersion: params.payload?.keyVersion,
      metadataJson: (params.metadataJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
