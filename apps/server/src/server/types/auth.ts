import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthContext {
  user?: AuthUser;
  viaToken: boolean;
  tokenScopeType?: 'global_bootstrap' | 'project' | 'service_account';
  projectId?: string;
  role?: Role | null;
  readOnly?: boolean;
  serviceAccountId?: string;
  scopeEnvironmentIds?: string[];
}
