import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { enforceGlobalBootstrapScope } from '../auth/guards.js';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from '../auth/session.js';
import { toUserDto } from '../mappers/users.js';
import { shouldLogStatus } from '../logging/policy.js';
import type { LogDispatcher } from '../logging/dispatcher.js';
import { buildRequestLogContext, logHandledError, sendLoggedError } from './logging.js';
import { getRequestOrigin, parseHeaderValue } from './validators.js';

export function registerCoreHttpMiddleware(
  app: FastifyInstance,
  logDispatcher: LogDispatcher,
): void {
  app.addHook('onRequest', async (request, reply) => {
    request.logDispatcher = logDispatcher;
    reply.header('x-request-id', request.id);
  });

  app.addHook('preHandler', async (request) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);
      const session = await prisma.userSession.findFirst({
        where: {
          tokenHash,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (session) {
        request.auth = {
          user: toUserDto(session.user),
          viaToken: false,
        };
        return;
      }
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice('Bearer '.length).trim();
      if (raw) {
        const tokenHash = hashToken(raw);
        const token = await prisma.apiToken.findFirst({
          where: {
            tokenHash,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { creator: true },
        });
        if (token) {
          const membership = await prisma.projectMember.findUnique({
            where: {
              projectId_userId: {
                projectId: token.projectId,
                userId: token.createdBy,
              },
            },
          });

          request.auth = {
            user: toUserDto(token.creator),
            viaToken: true,
            tokenScopeType: 'project',
            projectId: token.projectId,
            role: membership?.role ?? null,
            readOnly: token.readOnly,
          };

          await prisma.apiToken.update({
            where: { id: token.id },
            data: { lastUsedAt: new Date() },
          });
          return;
        }

        const serviceToken = await prisma.serviceAccountToken.findFirst({
          where: {
            tokenHash,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            serviceAccount: true,
            environments: true,
          },
        });

        if (serviceToken) {
          const scopeEnvironmentIds = serviceToken.environments.map(
            (scope) => scope.environmentId,
          );
          request.auth = {
            viaToken: true,
            tokenScopeType: 'service_account',
            projectId: serviceToken.serviceAccount.projectId,
            role: Role.EDITOR,
            readOnly: serviceToken.readOnly,
            serviceAccountId: serviceToken.serviceAccountId,
            scopeEnvironmentIds,
          };

          await prisma.serviceAccountToken.update({
            where: { id: serviceToken.id },
            data: { lastUsedAt: new Date() },
          });
          return;
        }

        const globalToken = await prisma.globalCliToken.findFirst({
          where: {
            tokenHash,
            revokedAt: null,
            deletedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { creator: true },
        });
        if (globalToken) {
          request.auth = {
            user: toUserDto(globalToken.creator),
            viaToken: true,
            tokenScopeType: 'global_bootstrap',
            readOnly: false,
          };

          await prisma.globalCliToken.update({
            where: { id: globalToken.id },
            data: { lastUsedAt: new Date() },
          });
        }
      }
    }
  });

  app.setErrorHandler(async (error: { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode ?? reply.statusCode ?? 500;
    if (shouldLogStatus(statusCode) && !request.errorLogged) {
      await logDispatcher.emit({
        event: statusCode >= 500 ? 'request.failed' : 'request.denied',
        level: statusCode >= 500 ? 'error' : 'warn',
        category: request.errorCategory ?? (statusCode >= 500 ? 'internal' : 'domain'),
        message: statusCode >= 500 ? 'request failed' : 'request denied',
        context: buildRequestLogContext(request, statusCode),
        err: statusCode >= 500 ? error : undefined,
      });
      request.errorLogged = true;
    }
    reply.send(error);
  });

  app.addHook('onResponse', async (request, reply) => {
    if (shouldLogStatus(reply.statusCode) && !request.errorLogged) {
      await logHandledError({
        request,
        reply,
        statusCode: reply.statusCode,
        category: request.errorCategory ?? (reply.statusCode >= 500 ? 'internal' : 'domain'),
        message: reply.statusCode >= 500 ? 'request failed' : 'request denied',
      });
      request.errorLogged = true;
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const setCsrfCookie = () => {
      const csrfToken = generateToken();
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
    };

    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && !request.cookies[CSRF_COOKIE_NAME]) {
      setCsrfCookie();
    }

    const routePath =
      (request.routeOptions && request.routeOptions.url) ||
      (request as { routerPath?: string }).routerPath ||
      request.url.split('?')[0];
    if (routePath === '/auth/cli-login' || routePath === '/auth/cli-login/complete') {
      return;
    }

    if (!enforceGlobalBootstrapScope(request, reply)) {
      request.errorCategory = 'auth';
      await logHandledError({
        request,
        reply,
        statusCode: 403,
        category: 'auth',
        message: 'global bootstrap token denied route access',
        data: {
          routePath,
          tokenScopeType: request.auth?.tokenScopeType ?? null,
          userId: request.auth?.user?.id ?? null,
        },
      });
      return;
    }

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return;
    }

    if (request.auth?.viaToken && request.auth.readOnly) {
      request.errorCategory = 'auth';
      return sendLoggedError(
        reply,
        request,
        403,
        'Read-only token cannot perform write actions',
        'auth',
      );
    }

    if (request.auth?.viaToken) {
      return;
    }

    const origin = getRequestOrigin(request);
    if (!origin || !config.appOrigins.includes(origin)) {
      request.errorCategory = 'security';
      return sendLoggedError(reply, request, 403, 'Invalid origin', 'security');
    }

    if (sessionToken) {
      const csrfCookie = request.cookies[CSRF_COOKIE_NAME];
      const csrfHeader = parseHeaderValue(request.headers['x-csrf-token']);

      // Bootstrap token for existing sessions that are missing the CSRF cookie in prod.
      if (!csrfCookie) {
        setCsrfCookie();
        return;
      }

      if (!csrfCookie || !csrfHeader || csrfHeader !== csrfCookie) {
        request.errorCategory = 'security';
        return sendLoggedError(reply, request, 403, 'Invalid CSRF token', 'security');
      }
    }
  });
}
