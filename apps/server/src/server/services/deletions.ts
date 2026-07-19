import { and, count, eq } from 'drizzle-orm';
import {
  apiTokens,
  auditLogs,
  db,
  environments,
  projects,
  secrets,
  serviceAccounts,
} from '../../db/index.js';

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

async function countWhere(
  table: typeof environments | typeof apiTokens | typeof serviceAccounts | typeof secrets,
  where: ReturnType<typeof eq> | ReturnType<typeof and>,
): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return Number(row?.value ?? 0);
}

export async function deleteProjectWithGuards(params: {
  projectId: string;
  confirmText: string;
} & ActorContext): Promise<DeleteFailure | DeleteSuccess> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.projectId),
    columns: { id: true, name: true },
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

  const [environmentCount, secretCount, tokenCount, serviceAccountCount] = await Promise.all([
    countWhere(environments, eq(environments.projectId, params.projectId)),
    db
      .select({ value: count() })
      .from(secrets)
      .innerJoin(environments, eq(secrets.environmentId, environments.id))
      .where(eq(environments.projectId, params.projectId))
      .then((rows) => Number(rows[0]?.value ?? 0)),
    countWhere(apiTokens, eq(apiTokens.projectId, params.projectId)),
    countWhere(serviceAccounts, eq(serviceAccounts.projectId, params.projectId)),
  ]);

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
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
      },
    });

    await tx.delete(projects).where(eq(projects.id, params.projectId));
  });

  return { ok: true };
}

export async function deleteEnvironmentWithGuards(params: {
  projectId: string;
  environmentId: string;
  confirmText: string;
  forceLastEnvironment?: boolean;
} & ActorContext): Promise<DeleteFailure | DeleteSuccess> {
  const environment = await db.query.environments.findFirst({
    where: and(
      eq(environments.id, params.environmentId),
      eq(environments.projectId, params.projectId),
    ),
    columns: { id: true, projectId: true, name: true },
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
    countWhere(environments, eq(environments.projectId, params.projectId)),
    countWhere(secrets, eq(secrets.environmentId, params.environmentId)),
  ]);
  const isLastEnvironment = environmentCount === 1;
  if (isLastEnvironment && params.forceLastEnvironment !== true) {
    return {
      ok: false,
      status: 409,
      error: 'Deleting the last environment requires explicit confirmation',
    };
  }

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      projectId: params.projectId,
      actorUserId: params.actorUserId ?? null,
      actorServiceAccountId: params.actorServiceAccountId ?? null,
      action: 'environment.delete',
      resourceType: 'environment',
      resourceId: params.environmentId,
      metadataJson: {
        secretCount,
        isLastEnvironment,
      },
    });

    await tx.delete(environments).where(eq(environments.id, params.environmentId));
  });

  return { ok: true };
}
