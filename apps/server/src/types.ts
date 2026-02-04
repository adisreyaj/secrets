import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthContext {
  user?: AuthUser;
  viaToken: boolean;
  projectId?: string;
  role?: Role | null;
  readOnly?: boolean;
  serviceAccountId?: string;
  scopeEnvironmentIds?: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
