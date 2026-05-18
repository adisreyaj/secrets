import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

type ActorContext = {
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
};

type DeleteFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
};

type DeleteSuccess = {
  ok: true;
};

export async function deleteProjectWithGuards(params: {
  projectId: string;
  confirmText: string;
} & ActorContext): Promise<DeleteFailure | DeleteSuccess> {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return { ok: false, status: 404, error: 'Project not found' };
  }

  if (!params.confirmText || params.confirmText !== project.name) {
    return {
      ok: false,
      status: 400,
      error: 'Confirmation text must exactly match project name',
    };
  }

  const [environmentCount, secretCount, tokenCount, serviceAccountCount] =
    await Promise.all([
      prisma.environment.count({ where: { projectId: params.projectId } }),
      prisma.secret.count({
        where: { environment: { projectId: params.projectId } },
      }),
      prisma.apiToken.count({ where: { projectId: params.projectId } }),
      prisma.serviceAccount.count({ where: { projectId: params.projectId } }),
    ]);

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        projectId: params.projectId,
        actorUserId: params.actorUserId ?? null,
        actorServiceAccountId: params.actorServiceAccountId ?? null,
        action: 'project.delete',
        resourceType: 'project',
        resourceId: params.projectId,
        metadataJson: {
          environmentCount,
          secretCount,
          tokenCount,
          serviceAccountCount,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.project.delete({
      where: { id: params.projectId },
    });
  });

  return { ok: true };
}

export async function deleteEnvironmentWithGuards(params: {
  projectId: string;
  environmentId: string;
  confirmText: string;
  forceLastEnvironment?: boolean;
} & ActorContext): Promise<DeleteFailure | DeleteSuccess> {
  const environment = await prisma.environment.findFirst({
    where: { id: params.environmentId, projectId: params.projectId },
    select: { id: true, projectId: true, name: true },
  });
  if (!environment) {
    return { ok: false, status: 404, error: 'Environment not found' };
  }

  if (!params.confirmText || params.confirmText !== environment.name) {
    return {
      ok: false,
      status: 400,
      error: 'Confirmation text must exactly match environment name',
    };
  }

  const [environmentCount, secretCount] = await Promise.all([
    prisma.environment.count({ where: { projectId: params.projectId } }),
    prisma.secret.count({ where: { environmentId: params.environmentId } }),
  ]);
  const isLastEnvironment = environmentCount === 1;
  if (isLastEnvironment && params.forceLastEnvironment !== true) {
    return {
      ok: false,
      status: 409,
      error: 'Deleting the last environment requires explicit confirmation',
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        projectId: params.projectId,
        actorUserId: params.actorUserId ?? null,
        actorServiceAccountId: params.actorServiceAccountId ?? null,
        action: 'environment.delete',
        resourceType: 'environment',
        resourceId: params.environmentId,
        metadataJson: {
          secretCount,
          isLastEnvironment,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.environment.delete({
      where: { id: params.environmentId },
    });
  });

  return { ok: true };
}
