import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { generateToken, hashToken } from '../../auth.js';
import { getDashboardSession } from '../../betterAuth.js';
import { config } from '../../config.js';
import { DecryptionError } from '../../crypto.js';
import {
  apiTokens,
  db,
  globalCliTokens,
  projectMembers,
  serviceAccountTokens,
} from '../../db/index.js';
import { enforceGlobalBootstrapScope } from '../auth/guards.js';
import { CSRF_COOKIE_NAME } from '../auth/session.js';
import { toUserDto } from '../mappers/users.js';
import { shouldLogStatus } from '../logging/policy.js';
import type { LogDispatcher } from '../logging/dispatcher.js';
import { buildRequestLogContext, logHandledError, sendLoggedError } from './logging.js';
import { getRequestOrigin, parseHeaderValue } from './validators.js';

function isBetterAuthPath(path: string): boolean {
  return path === '/api/auth' || path.startsWith('/api/auth/');
}

export function registerCoreHttpMiddleware(
  app: FastifyInstance,
  logDispatcher: LogDispatcher,
): void {
  app.addHook('onRequest', async (request, reply) => {
    request.logDispatcher = logDispatcher;
    reply.header('x-request-id', request.id);
  });

  app.addHook('preHandler', async (request) => {
    const dashboardSession = await getDashboardSession(request.headers);
    if (dashboardSession?.user) {
      request.auth = {
        user: toUserDto({
          id: dashboardSession.user.id,
          email: dashboardSession.user.email,
          name: dashboardSession.user.name ?? null,
        }),
        viaToken: false,
      };
      return;
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice('Bearer '.length).trim();
      if (raw) {
        const tokenHash = hashToken(raw);
        const now = new Date();
        const token = await db.query.apiTokens.findFirst({
          where: and(
            eq(apiTokens.tokenHash, tokenHash),
            or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
          ),
          with: { creator: true },
        });
        if (token) {
          const membership = await db.query.projectMembers.findFirst({
            where: and(
              eq(projectMembers.projectId, token.projectId),
              eq(projectMembers.userId, token.createdBy),
            ),
          });

          request.auth = {
            user: toUserDto(token.creator),
            viaToken: true,
            tokenScopeType: 'project',
            projectId: token.projectId,
            role: membership?.role ?? null,
            readOnly: token.readOnly,
          };

          await db
            .update(apiTokens)
            .set({ lastUsedAt: now })
            .where(eq(apiTokens.id, token.id));
          return;
        }

        const serviceToken = await db.query.serviceAccountTokens.findFirst({
          where: and(
            eq(serviceAccountTokens.tokenHash, tokenHash),
            or(isNull(serviceAccountTokens.expiresAt), gt(serviceAccountTokens.expiresAt, now)),
          ),
          with: {
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
            role: serviceToken.role,
            readOnly: serviceToken.readOnly,
            serviceAccountId: serviceToken.serviceAccountId,
            scopeEnvironmentIds,
          };

          await db
            .update(serviceAccountTokens)
            .set({ lastUsedAt: now })
            .where(eq(serviceAccountTokens.id, serviceToken.id));
          return;
        }

        const globalToken = await db.query.globalCliTokens.findFirst({
          where: and(
            eq(globalCliTokens.tokenHash, tokenHash),
            isNull(globalCliTokens.revokedAt),
            isNull(globalCliTokens.deletedAt),
            gt(globalCliTokens.expiresAt, now),
          ),
          with: { creator: true },
        });
        if (globalToken) {
          request.auth = {
            user: toUserDto(globalToken.creator),
            viaToken: true,
            tokenScopeType: 'global_bootstrap',
            readOnly: false,
          };

          await db
            .update(globalCliTokens)
            .set({ lastUsedAt: now })
            .where(eq(globalCliTokens.id, globalToken.id));
        }
      }
    }
  });

  app.setErrorHandler(async (error: { statusCode?: number }, request, reply) => {
    const isDecryptionFailure = error instanceof DecryptionError;
    const statusCode = isDecryptionFailure ? 500 : error.statusCode ?? reply.statusCode ?? 500;
    if (shouldLogStatus(statusCode) && !request.errorLogged) {
      await logDispatcher.emit({
        event: statusCode >= 500 ? 'request.failed' : 'request.denied',
        level: statusCode >= 500 ? 'error' : 'warn',
        category: request.errorCategory ?? (statusCode >= 500 ? 'internal' : 'domain'),
        message: isDecryptionFailure
          ? 'decryption failure - ciphertext tampering or wrong key suspected'
          : statusCode >= 500
            ? 'request failed'
            : 'request denied',
        context: buildRequestLogContext(request, statusCode),
        err: statusCode >= 500 ? error : undefined,
      });
      request.errorLogged = true;
    }
    if (isDecryptionFailure) {
      reply.code(500).send({ error: 'Failed to decrypt secret' });
      return;
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

    const hasDashboardSession = Boolean(request.auth?.user && !request.auth.viaToken);
    if (hasDashboardSession && !request.cookies[CSRF_COOKIE_NAME]) {
      setCsrfCookie();
    }

    const routePath =
      (request.routeOptions && request.routeOptions.url) ||
      (request as { routerPath?: string }).routerPath ||
      request.url.split('?')[0];
    const requestPath = request.url.split('?')[0] ?? routePath;
    if (
      routePath === '/auth/cli-login' ||
      routePath === '/auth/cli-login/complete' ||
      isBetterAuthPath(requestPath)
    ) {
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

    if (hasDashboardSession) {
      const csrfCookie = request.cookies[CSRF_COOKIE_NAME];
      const csrfHeader = parseHeaderValue(request.headers['x-csrf-token']);

      // Bootstrap token for existing sessions that are missing the CSRF cookie in prod.
      if (!csrfCookie) {
        setCsrfCookie();
        return;
      }

      if (!csrfHeader || csrfHeader !== csrfCookie) {
        request.errorCategory = 'security';
        return sendLoggedError(reply, request, 403, 'Invalid CSRF token', 'security');
      }
    }
  });
}
