import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db, projectMembers, Role, type Role as RoleType } from '../../db/index.js';

export const ROLE_RANK: Record<RoleType, number> = {
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export async function getProjectRole(
  request: FastifyRequest,
  projectId: string,
): Promise<RoleType | null> {
  if (request.auth?.viaToken) {
    if (request.auth.projectId !== projectId) {
      return null;
    }
    return request.auth.role ?? null;
  }

  if (!request.auth?.user) {
    return null;
  }

  const membership = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, request.auth.user.id),
    ),
  });

  return membership?.role ?? null;
}

export { Role };
