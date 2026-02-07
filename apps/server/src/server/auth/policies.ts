import { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../db.js';

export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export async function getProjectRole(
  request: FastifyRequest,
  projectId: string,
): Promise<Role | null> {
  if (request.auth?.viaToken) {
    if (request.auth.projectId !== projectId) {
      return null;
    }
    return request.auth.role ?? null;
  }

  if (!request.auth?.user) {
    return null;
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: request.auth.user.id,
      },
    },
  });

  return membership?.role ?? null;
}
