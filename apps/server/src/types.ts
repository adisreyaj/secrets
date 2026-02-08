import type { AuthContext, AuthUser } from './server/types/auth.js';

export type { AuthContext, AuthUser };

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    errorLogged?: boolean;
  }
}
