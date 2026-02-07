import { Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '../types/auth.js';
import {
  approvalsRequireUser,
  forbidden,
  insufficientRole,
  tokenScopeDenied,
  unauthorized,
} from '../http/errors.js';
import { getProjectRole, ROLE_RANK } from './policies.js';

export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): AuthContext | null {
  if (!request.auth?.user && !request.auth?.serviceAccountId) {
    unauthorized(reply);
    return null;
  }

  return request.auth;
}

export async function requireProjectRole(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  minRole: Role,
): Promise<Role | null> {
  const role = await getProjectRole(request, projectId);
  if (!role) {
    forbidden(reply);
    return null;
  }

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    insufficientRole(reply);
    return null;
  }

  return role;
}

export function requireEnvironmentScope(
  request: FastifyRequest,
  reply: FastifyReply,
  environmentId: string,
): boolean {
  const scope = request.auth?.scopeEnvironmentIds;
  if (request.auth?.viaToken && scope && !scope.includes(environmentId)) {
    tokenScopeDenied(reply);
    return false;
  }
  return true;
}

export function requireUserForApproval(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (request.auth?.serviceAccountId && !request.auth.user) {
    approvalsRequireUser(reply);
    return false;
  }
  return true;
}
