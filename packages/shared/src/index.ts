export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface UserDto {
  id: string;
  email: string;
  name?: string | null;
}

export interface ProjectDto {
  id: string;
  name: string;
  slug?: string | null;
  createdAt: string;
  updatedAt: string;
  role?: Role;
}

export interface EnvironmentDto {
  id: string;
  projectId: string;
  name: string;
  slug?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecretDto {
  id: string;
  environmentId: string;
  key: string;
  updatedAt: string;
  versionId?: string;
  value?: string;
}

export interface AuditLogDto {
  id: string;
  projectId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApiTokenDto {
  id: string;
  projectId: string;
  name: string;
  readOnly?: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface AuthResponse {
  user: UserDto;
}

export interface UpdateMeRequest {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateProjectRequest {
  name: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  copyFromEnvironmentId?: string;
}

export interface CreateSecretRequest {
  key: string;
  value: string;
}

export interface UpdateSecretRequest {
  key?: string;
  value?: string;
}

export interface RollbackSecretRequest {
  versionId?: string;
}

export interface CopySecretRequest {
  targetEnvironmentIds: string[];
  overwrite?: boolean;
}

export interface CopySecretResponse {
  created: string[];
  updated: string[];
  skipped: string[];
}

export interface CopyEnvironmentSecretsRequest {
  sourceEnvironmentId: string;
  keys?: string[];
  overwrite?: boolean;
}

export interface CopyEnvironmentSecretsResponse {
  created: string[];
  updated: string[];
  skipped: string[];
}

export interface CreateTokenRequest {
  name: string;
  readOnly?: boolean;
}

export interface CreateTokenResponse {
  token: string;
  tokenMeta: ApiTokenDto;
}

export interface AddMemberRequest {
  email: string;
  role: Role;
}
