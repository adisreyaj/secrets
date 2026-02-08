import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LogCategory, RequestLogContext } from '../logging/types.js';
import { sanitizeForLogs, sanitizeHeaders } from '../logging/sanitize.js';
import { shouldLogStatus } from '../logging/policy.js';

export function buildRequestLogContext(
  request: FastifyRequest,
  statusCode?: number,
): RequestLogContext {
  const route =
    request.routeOptions?.url ?? (request as { routerPath?: string }).routerPath ?? 'unknown';

  return {
    requestId: request.id,
    method: request.method,
    url: request.url,
    route,
    statusCode,
    ip: request.ip,
    auth: request.auth
      ? {
          userId: request.auth.user?.id ?? null,
          serviceAccountId: request.auth.serviceAccountId ?? null,
          projectId: request.auth.projectId ?? null,
          viaToken: request.auth.viaToken,
          tokenScopeType: request.auth.tokenScopeType ?? null,
        }
      : null,
  };
}

export async function logHandledError(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  statusCode: number;
  message: string;
  category: LogCategory;
  data?: Record<string, unknown>;
}) {
  if (!shouldLogStatus(params.statusCode) || params.request.errorLogged) {
    return;
  }

  params.request.errorLogged = true;
  await params.request.logDispatcher?.emit({
    event: params.statusCode >= 500 ? 'request.failed' : 'request.denied',
    level: params.statusCode >= 500 ? 'error' : 'warn',
    category: params.category,
    message: params.message,
    context: buildRequestLogContext(params.request, params.statusCode),
    data: sanitizeForLogs({
      headers: sanitizeHeaders(params.request.headers as Record<string, unknown>),
      ...(params.data ?? {}),
    }),
  });
}

export async function sendLoggedError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  error: string,
  category: LogCategory = 'domain',
): Promise<void> {
  await logHandledError({
    request,
    reply,
    statusCode,
    message: error,
    category,
  });

  reply.code(statusCode).send({ error });
}
