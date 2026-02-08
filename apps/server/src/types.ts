import type { AuthContext, AuthUser } from './server/types/auth.js';
import type { LogDispatcher } from './server/logging/dispatcher.js';
import type { LogCategory } from './server/logging/types.js';

export type { AuthContext, AuthUser };

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    errorLogged?: boolean;
    errorCategory?: LogCategory;
    logDispatcher?: LogDispatcher;
  }
}
