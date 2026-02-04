export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELED';
export type ApprovalAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'ROLLBACK' | 'COPY' | 'COPY_FROM';

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

export interface ApprovalRuleDto {
  id: string;
  projectId: string;
  name: string;
  environmentId?: string | null;
  keyPattern: string;
  actions: ApprovalAction[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequestDto {
  id: string;
  projectId: string;
  environmentId: string;
  secretId?: string | null;
  action: ApprovalAction;
  status: ApprovalStatus;
  requestedBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  deniedAt?: string | null;
  canceledAt?: string | null;
  key: string;
  targetEnvironmentId?: string | null;
  expectedVersionId?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  proposedValue?: string | null;
  currentValue?: string | null;
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
  expiresAt?: string | null;
}

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface ProjectInviteDto {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
}

export interface CreateInviteRequest {
  email: string;
  role: Role;
}

export interface CreateInviteResponse {
  invite: ProjectInviteDto;
  token: string;
}

export interface AcceptInviteRequest {
  token: string;
}

export interface AcceptInviteResponse {
  ok: true;
  projectId: string;
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

export interface ApprovalRequestResponse {
  status: 'pending';
  approvalRequestId?: string;
  approvalRequestIds?: string[];
}

export interface CreateApprovalRuleRequest {
  name: string;
  environmentId?: string | null;
  keyPattern: string;
  actions: ApprovalAction[];
  isActive?: boolean;
}

export interface UpdateApprovalRuleRequest {
  name?: string;
  environmentId?: string | null;
  keyPattern?: string;
  actions?: ApprovalAction[];
  isActive?: boolean;
}

export interface CreateTokenRequest {
  name: string;
  readOnly?: boolean;
}

export interface CreateTokenResponse {
  token: string;
  tokenMeta: ApiTokenDto;
}

export interface CliLoginStartResponse {
  code: string;
  loginUrl: string;
  expiresAt: string;
}

export interface CliLoginIssueRequest {
  code: string;
  projectId: string;
  name?: string;
}

export interface CliLoginIssueResponse {
  token: string;
  tokenMeta: ApiTokenDto;
}

export interface CliLoginCompleteRequest {
  code: string;
}

export interface CliLoginCompleteResponse {
  status: 'pending' | 'complete';
  token?: string;
  projectId?: string | null;
}

export interface SecretDiffResponse {
  secretId: string;
  key: string;
  current: {
    versionId: string;
    value: string;
    createdAt: string;
  };
  previous: {
    versionId: string;
    value: string;
    createdAt: string;
  };
}

export interface SecretVersionDto {
  id: string;
  createdAt: string;
  isActive: boolean;
}

export interface AddMemberRequest {
  email: string;
  role: Role;
}

export interface ProjectMemberDto {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  name?: string | null;
  role: Role;
  createdAt?: string;
}
