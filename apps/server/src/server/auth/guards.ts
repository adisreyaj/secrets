import { ProjectModuleKey, Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hashToken } from '../../auth.js';
import { prisma } from '../../db.js';
import type { AuthContext } from '../types/auth.js';
import {
  approvalsRequireUser,
  forbidden,
  globalBootstrapScopeDenied,
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

export async function requireProjectModuleEnabled(
  _request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  module: ProjectModuleKey,
): Promise<boolean> {
  const moduleConfig = await prisma.projectModule.findUnique({
    where: {
      projectId_module: {
        projectId,
        module,
      },
    },
  });

  if (!moduleConfig?.enabled) {
    reply.code(403).send({ error: `${module.toLowerCase()} module is disabled for this project` });
    return false;
  }

  return true;
}

export async function requireProjectAuthSession(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
): Promise<{ sessionId: string; endUserId: string; email: string } | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(reply);
    return null;
  }

  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) {
    unauthorized(reply);
    return null;
  }

  const session = await prisma.authSession.findFirst({
    where: {
      projectId,
      sessionTokenHash: hashToken(rawToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      endUser: {
        select: {
          id: true,
          email: true,
          disabledAt: true,
        },
      },
    },
  });

  if (!session || !session.endUser) {
    unauthorized(reply);
    return null;
  }

  if (session.endUser.disabledAt) {
    forbidden(reply);
    return null;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return {
    sessionId: session.id,
    endUserId: session.endUser.id,
    email: session.endUser.email,
  };
}

const GLOBAL_BOOTSTRAP_ALLOWLIST = new Set([
  'GET /projects',
  'POST /projects',
  'GET /projects/:id/environments',
  'GET /projects/:id/environments/slug/:slug',
]);

export function enforceGlobalBootstrapScope(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (request.auth?.tokenScopeType !== 'global_bootstrap') {
    return true;
  }

  const routePath =
    request.routeOptions?.url ??
    (request as { routerPath?: string }).routerPath ??
    request.url.split('?')[0];
  const routeKey = `${request.method.toUpperCase()} ${routePath}`;
  if (GLOBAL_BOOTSTRAP_ALLOWLIST.has(routeKey)) {
    return true;
  }

  globalBootstrapScopeDenied(reply);
  return false;
}
