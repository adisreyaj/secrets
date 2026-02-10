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
  organizationId?: string | null;
  name: string;
  slug?: string | null;
  auditRetentionDays?: number | null;
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
  actorServiceAccountId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogFilters {
  start?: string;
  end?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  actorServiceAccountId?: string;
  limit?: number;
}

export interface AuditRetentionDto {
  projectId: string;
  auditRetentionDays: number | null;
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
  projectSlug?: string | null;
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
  organizationId?: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  copyFromEnvironmentId?: string;
}

export interface DeleteProjectRequest {
  confirmText: string;
}

export interface DeleteEnvironmentRequest {
  confirmText: string;
  forceLastEnvironment?: boolean;
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
  skippedDetails?: {
    key: string;
    reason: string;
    code: string;
  }[];
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
  mode?: 'global' | 'project';
  projectId?: string;
  name?: string;
}

export interface CliTokenMetaDto {
  id: string;
  scopeType: 'global_bootstrap' | 'project';
  projectId?: string;
  name: string;
  readOnly?: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}

export interface CliLoginIssueResponse {
  token: string;
  tokenMeta: CliTokenMetaDto;
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

export interface SecretSearchResultDto {
  id: string;
  key: string;
  environmentId: string;
  environmentName: string;
  updatedAt: string;
  value?: string;
}

export interface BulkImportRequest {
  entries: { key: string; value: string }[];
  overwrite?: boolean;
}

export interface BulkImportResponse {
  created: number;
  updated: number;
  skipped: number;
  pending: number;
  approvalRequestIds: string[];
}

export interface ServiceAccountDto {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  createdBy: string;
  environmentIds: string[];
}

export interface ServiceAccountTokenDto {
  id: string;
  serviceAccountId: string;
  name: string;
  readOnly: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}

export interface CreateServiceAccountRequest {
  name: string;
  environmentIds: string[];
}

export interface CreateServiceAccountTokenRequest {
  name: string;
  readOnly?: boolean;
  environmentIds: string[];
  expiresAt?: string | null;
}

export interface CreateServiceAccountTokenResponse {
  token: string;
  tokenMeta: ServiceAccountTokenDto;
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

export type ModuleKey = 'secrets' | 'flags' | 'auth';

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationRequest {
  name: string;
}

export interface OrganizationMemberDto {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  name?: string | null;
  role: Role;
  createdAt: string;
}

export interface AddOrganizationMemberRequest {
  email: string;
  role: Role;
}

export interface ProjectModuleDto {
  projectId: string;
  module: ModuleKey;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProjectModuleRequest {
  enabled: boolean;
}

export type FlagValueType = 'BOOLEAN' | 'MULTIVARIATE';

export interface FeatureFlagVariantDto {
  id: string;
  flagId: string;
  key: string;
  value: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagRuleDto {
  id: string;
  flagId: string;
  priority: number;
  environmentId?: string | null;
  rolloutPercentage: number;
  variantId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagDto {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string | null;
  valueType: FlagValueType;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagSdkKeyDto {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export type AuthProviderType = 'google' | 'github';

export interface AuthProjectConfigDto {
  projectId: string;
  nativeAuthEnabled: boolean;
  emailPasswordEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthProviderDto {
  id: string;
  projectId: string;
  provider: AuthProviderType;
  enabled: boolean;
  clientId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthClientDto {
  id: string;
  projectId: string;
  name: string;
  type: 'public' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

export const managementQueryKeys = {
  projects: () => ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  organizations: () => ['organizations'] as const,
  organization: (organizationId: string) =>
    ['organizations', organizationId] as const,
  organizationMembers: (organizationId: string) =>
    ['organizations', organizationId, 'members'] as const,
  projectModules: (projectId: string) =>
    ['projects', projectId, 'modules'] as const,
  environments: (projectId: string) =>
    ['projects', projectId, 'environments'] as const,
  environment: (environmentId: string) =>
    ['environments', environmentId] as const,
  secrets: (environmentId: string, includeValues: boolean) =>
    ['environments', environmentId, 'secrets', includeValues] as const,
  approvals: (
    projectId: string,
    status?: string,
    environmentId?: string | null,
  ) =>
    [
      'projects',
      projectId,
      'approvals',
      status ?? 'all',
      environmentId ?? 'all',
    ] as const,
  approvalRules: (projectId: string) =>
    ['projects', projectId, 'approval-rules'] as const,
  approval: (approvalId: string) => ['approvals', approvalId] as const,
  members: (projectId: string) => ['projects', projectId, 'members'] as const,
  invites: (projectId: string) => ['projects', projectId, 'invites'] as const,
  tokens: (projectId: string) => ['projects', projectId, 'tokens'] as const,
  serviceAccounts: (projectId: string) =>
    ['projects', projectId, 'service-accounts'] as const,
  serviceAccountTokens: (accountId: string) =>
    ['service-accounts', accountId, 'tokens'] as const,
  audit: (projectId: string, filtersKey?: string) =>
    ['projects', projectId, 'audit', filtersKey ?? 'all'] as const,
  secretVersions: (secretId: string) =>
    ['secrets', secretId, 'versions'] as const,
  secretDiff: (secretId: string, from?: string, to?: string) =>
    ['secrets', secretId, 'diff', from ?? 'current', to ?? 'current'] as const,
  searchSecrets: (
    projectId: string,
    query: string,
    environmentId?: string | null,
    includeValues?: boolean,
  ) =>
    [
      'projects',
      projectId,
      'secrets',
      'search',
      query,
      environmentId ?? 'all',
      includeValues ? 'values' : 'keys',
    ] as const,
  secretCoverage: (projectId: string) =>
    ['projects', projectId, 'secrets', 'coverage'] as const,
  flags: (projectId: string) => ['projects', projectId, 'flags'] as const,
  flag: (flagId: string) => ['flags', flagId] as const,
  flagVariants: (flagId: string) => ['flags', flagId, 'variants'] as const,
  flagRules: (flagId: string) => ['flags', flagId, 'rules'] as const,
  flagSdkKeys: (projectId: string) =>
    ['projects', projectId, 'flag-sdk-keys'] as const,
  authConfig: (projectId: string) =>
    ['projects', projectId, 'auth', 'config'] as const,
  authProviders: (projectId: string) =>
    ['projects', projectId, 'auth', 'providers'] as const,
  authClients: (projectId: string) =>
    ['projects', projectId, 'auth', 'clients'] as const,
};
