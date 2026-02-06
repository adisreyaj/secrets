import type { FastifyReply, FastifyRequest } from 'fastify';

export type MaybeAuthedRequest = FastifyRequest & {
  auth?: {
    user?: { id: string };
    serviceAccountId?: string;
    viaToken: boolean;
    projectId?: string;
    role?: string | null;
    readOnly?: boolean;
    scopeEnvironmentIds?: string[];
  };
};

export type GuardResult<T> = T | null;

export type RequestGuard<T> = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<GuardResult<T>> | GuardResult<T>;
