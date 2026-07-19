import { and, eq, ne } from 'drizzle-orm';
import { auditLogs, db, projectMembers, projects } from '../../db/index.js';
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

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, params.projectId),
    columns: { name: true },
  });
  if (!existing) {
    return { ok: false, status: 404, error: 'Project not found' };
  }

  if (existing.name !== nextName) {
    const memberships = await db.query.projectMembers.findMany({
      where: and(
        eq(projectMembers.userId, params.actorUserId),
        ne(projectMembers.projectId, params.projectId),
      ),
      with: {
        project: {
          columns: { name: true },
        },
      },
    });
    const conflict = memberships.some(
      (membership) =>
        normalizeIdentifier(membership.project.name) === normalizeIdentifier(nextName),
    );
    if (conflict) {
      return { ok: false, status: 409, error: 'Project name already exists' };
    }
  }

  const [project] = await db
    .update(projects)
    .set({ name: nextName })
    .where(eq(projects.id, params.projectId))
    .returning();

  if (!project) {
    return { ok: false, status: 404, error: 'Project not found' };
  }

  await db.insert(auditLogs).values({
    projectId: params.projectId,
    actorUserId: params.actorUserId ?? null,
    actorServiceAccountId: params.actorServiceAccountId ?? null,
    action: 'project.update',
    resourceType: 'project',
    resourceId: params.projectId,
    metadataJson: {
      oldName: existing.name,
      newName: project.name,
    },
  });

  return { ok: true, project };
}
