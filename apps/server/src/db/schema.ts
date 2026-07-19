import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
  ApprovalAction,
  ApprovalStatus,
  AuthClientType,
  AuthIdentityProvider,
  FeatureFlagRuntime,
  FeatureFlagValueType,
  InviteStatus,
  ProjectModuleKey,
  Role,
} from './enums.js';

const id = () => text('id').primaryKey().$defaultFn(() => createId());
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const bool = (name: string, defaultValue = false) =>
  integer(name, { mode: 'boolean' }).notNull().default(defaultValue);
const jsonText = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const blobBuf = (name: string) => blob(name, { mode: 'buffer' });

export const users = sqliteTable('users', {
  id: id(),
  name: text('name').notNull().default(''),
  email: text('email').notNull(),
  emailVerified: bool('email_verified', false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_uk').on(t.email)]);

export const session = sqliteTable('session', {
  id: id(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('session_token_uk').on(t.token),
  index('session_user_id_idx').on(t.userId),
]);

export const account = sqliteTable('account', {
  id: id(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('account_user_id_idx').on(t.userId)]);

export const verification = sqliteTable('verification', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('verification_identifier_idx').on(t.identifier)]);

export const organizations = sqliteTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('organizations_slug_uk').on(t.slug)]);

export const organizationMembers = sqliteTable('organization_members', {
  id: id(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<Role>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('organization_members_org_user_uk').on(t.organizationId, t.userId),
  index('organization_members_user_id_idx').on(t.userId),
]);

export const projects = sqliteTable('projects', {
  id: id(),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  slug: text('slug'),
  auditRetentionDays: integer('audit_retention_days').default(90),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('projects_slug_uk').on(t.slug),
  index('projects_organization_id_idx').on(t.organizationId),
]);

export const projectModules = sqliteTable('project_modules', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  module: text('module').$type<ProjectModuleKey>().notNull(),
  enabled: bool('enabled', true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('project_modules_project_module_uk').on(t.projectId, t.module)]);

export const projectMembers = sqliteTable('project_members', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<Role>().notNull(),
}, (t) => [
  uniqueIndex('project_members_project_user_uk').on(t.projectId, t.userId),
  index('project_members_user_id_idx').on(t.userId),
]);

export const projectInvites = sqliteTable('project_invites', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').$type<Role>().notNull(),
  status: text('status').$type<InviteStatus>().notNull().default('PENDING'),
  tokenHash: text('token_hash').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('project_invites_project_id_idx').on(t.projectId),
  index('project_invites_project_created_idx').on(t.projectId, t.createdAt),
  index('project_invites_lookup_idx').on(t.projectId, t.email, t.status, t.expiresAt),
  index('project_invites_email_idx').on(t.email),
  index('project_invites_token_hash_idx').on(t.tokenHash),
  index('project_invites_status_idx').on(t.status),
]);

export const cliLoginSessions = sqliteTable('cli_login_sessions', {
  id: id(),
  code: text('code').notNull(),
  token: text('token'),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  projectId: text('project_id'),
  createdAt: createdAt(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
}, (t) => [
  uniqueIndex('cli_login_sessions_code_uk').on(t.code),
  index('cli_login_sessions_user_id_idx').on(t.userId),
  index('cli_login_sessions_expires_at_idx').on(t.expiresAt),
  index('cli_login_sessions_consumed_at_idx').on(t.consumedAt),
]);

export const environments = sqliteTable('environments', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug'),
  encryptedDek: blobBuf('encrypted_dek'),
  encryptedDekBackup: blobBuf('encrypted_dek_backup'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('environments_project_name_uk').on(t.projectId, t.name),
  uniqueIndex('environments_project_slug_uk').on(t.projectId, t.slug),
  index('environments_project_created_idx').on(t.projectId, t.createdAt),
]);

export const secrets = sqliteTable('secrets', {
  id: id(),
  environmentId: text('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (t) => [
  uniqueIndex('secrets_environment_key_uk').on(t.environmentId, t.key),
  index('secrets_environment_deleted_idx').on(t.environmentId, t.deletedAt),
]);

export const secretVersions = sqliteTable('secret_versions', {
  id: id(),
  secretId: text('secret_id')
    .notNull()
    .references(() => secrets.id, { onDelete: 'cascade' }),
  ciphertext: blobBuf('ciphertext').notNull(),
  iv: blobBuf('iv').notNull(),
  tag: blobBuf('tag').notNull(),
  keyVersion: text('key_version').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  isActive: bool('is_active', true),
}, (t) => [
  index('secret_versions_secret_active_idx').on(t.secretId, t.isActive),
  index('secret_versions_secret_created_idx').on(t.secretId, t.createdAt),
]);

export const apiTokens = sqliteTable('api_tokens', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  readOnly: bool('read_only', false),
  createdAt: createdAt(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('api_tokens_project_id_idx').on(t.projectId),
  index('api_tokens_project_created_idx').on(t.projectId, t.createdAt),
  index('api_tokens_token_hash_idx').on(t.tokenHash),
  index('api_tokens_expires_at_idx').on(t.expiresAt),
]);

export const globalCliTokens = sqliteTable('global_cli_tokens', {
  id: id(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('global_cli_tokens_token_hash_idx').on(t.tokenHash),
  index('global_cli_tokens_created_by_idx').on(t.createdBy),
  index('global_cli_tokens_expires_at_idx').on(t.expiresAt),
  index('global_cli_tokens_revoked_deleted_idx').on(t.revokedAt, t.deletedAt),
]);

export const serviceAccounts = sqliteTable('service_accounts', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [index('service_accounts_project_id_idx').on(t.projectId)]);

export const serviceAccountTokens = sqliteTable('service_account_tokens', {
  id: id(),
  serviceAccountId: text('service_account_id')
    .notNull()
    .references(() => serviceAccounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').$type<Role>().notNull().default('VIEWER'),
  tokenHash: text('token_hash').notNull(),
  readOnly: bool('read_only', false),
  createdAt: createdAt(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('service_account_tokens_sa_id_idx').on(t.serviceAccountId),
  index('service_account_tokens_token_hash_idx').on(t.tokenHash),
]);

export const serviceAccountEnvironments = sqliteTable(
  'service_account_environments',
  {
    serviceAccountId: text('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.serviceAccountId, t.environmentId] }),
    index('sa_environments_env_idx').on(t.environmentId),
  ],
);

export const serviceAccountTokenEnvironments = sqliteTable(
  'service_account_token_environments',
  {
    serviceAccountTokenId: text('service_account_token_id')
      .notNull()
      .references(() => serviceAccountTokens.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.serviceAccountTokenId, t.environmentId] }),
    index('sa_token_environments_env_idx').on(t.environmentId),
  ],
);

export const auditLogs = sqliteTable('audit_logs', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorServiceAccountId: text('actor_service_account_id').references(
    () => serviceAccounts.id,
    { onDelete: 'set null' },
  ),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadataJson: jsonText<Record<string, unknown>>('metadata_json'),
  createdAt: createdAt(),
}, (t) => [
  index('audit_logs_actor_user_id_idx').on(t.actorUserId),
  index('audit_logs_project_created_idx').on(t.projectId, t.createdAt),
  index('audit_logs_resource_idx').on(t.resourceType, t.resourceId),
  index('audit_logs_actor_sa_id_idx').on(t.actorServiceAccountId),
]);

export const approvalRules = sqliteTable('approval_rules', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  environmentId: text('environment_id').references(() => environments.id, {
    onDelete: 'cascade',
  }),
  keyPattern: text('key_pattern').notNull(),
  actionsJson: jsonText<unknown>('actions_json').notNull(),
  isActive: bool('is_active', true),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('approval_rules_project_id_idx').on(t.projectId),
  index('approval_rules_environment_id_idx').on(t.environmentId),
  index('approval_rules_is_active_idx').on(t.isActive),
  index('approval_rules_project_active_env_idx').on(
    t.projectId,
    t.isActive,
    t.environmentId,
  ),
]);

export const approvalRequests = sqliteTable('approval_requests', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  environmentId: text('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' }),
  secretId: text('secret_id').references(() => secrets.id, { onDelete: 'cascade' }),
  action: text('action').$type<ApprovalAction>().notNull(),
  status: text('status').$type<ApprovalStatus>().notNull().default('PENDING'),
  requestedBy: text('requested_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
  deniedAt: integer('denied_at', { mode: 'timestamp_ms' }),
  canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
  key: text('key').notNull(),
  payloadCiphertext: blobBuf('payload_ciphertext'),
  payloadIv: blobBuf('payload_iv'),
  payloadTag: blobBuf('payload_tag'),
  payloadKeyVersion: text('payload_key_version'),
  targetEnvironmentId: text('target_environment_id'),
  expectedVersionId: text('expected_version_id'),
  metadataJson: jsonText<Record<string, unknown>>('metadata_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('approval_requests_project_status_idx').on(t.projectId, t.status),
  index('approval_requests_project_status_created_idx').on(
    t.projectId,
    t.status,
    t.createdAt,
  ),
  index('approval_requests_pending_lookup_idx').on(
    t.projectId,
    t.environmentId,
    t.action,
    t.status,
    t.key,
  ),
  index('approval_requests_status_created_idx').on(t.status, t.createdAt),
  index('approval_requests_env_status_idx').on(t.environmentId, t.status),
  index('approval_requests_requested_by_status_idx').on(t.requestedBy, t.status),
  index('approval_requests_secret_status_idx').on(t.secretId, t.status),
  index('approval_requests_action_idx').on(t.action),
]);

export const featureFlags = sqliteTable('feature_flags', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  valueType: text('value_type').$type<FeatureFlagValueType>().notNull(),
  enabled: bool('enabled', true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (t) => [
  uniqueIndex('feature_flags_project_key_uk').on(t.projectId, t.key),
  index('ff_project_deleted_created_idx').on(t.projectId, t.deletedAt, t.createdAt),
]);

export const featureFlagEnvironmentConfigs = sqliteTable(
  'feature_flag_environment_configs',
  {
    id: id(),
    flagId: text('flag_id')
      .notNull()
      .references(() => featureFlags.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    enabled: bool('enabled', true),
    valueType: text('value_type').$type<FeatureFlagValueType>().notNull(),
    booleanValue: integer('boolean_value', { mode: 'boolean' }),
    jsonValue: jsonText<unknown>('json_value'),
    runtime: text('runtime').$type<FeatureFlagRuntime>().notNull().default('BOTH'),
    labelsJson: jsonText<unknown>('labels_json'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ff_env_cfg_flag_env_uk').on(t.flagId, t.environmentId),
    index('ff_env_cfg_env_idx').on(t.environmentId),
  ],
);

export const featureFlagSdkKeys = sqliteTable('feature_flag_sdk_keys', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('ff_sdk_keys_project_id_idx').on(t.projectId),
  index('ff_sdk_keys_project_created_idx').on(t.projectId, t.createdAt),
  index('ff_sdk_keys_token_hash_idx').on(t.tokenHash),
  index('ff_sdk_keys_revoked_at_idx').on(t.revokedAt),
]);

export const featureFlagChangeHistory = sqliteTable('feature_flag_change_history', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  flagId: text('flag_id').references(() => featureFlags.id, { onDelete: 'set null' }),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadataJson: jsonText<Record<string, unknown>>('metadata_json'),
  createdAt: createdAt(),
}, (t) => [
  index('ff_change_history_project_created_idx').on(t.projectId, t.createdAt),
  index('ff_change_history_flag_id_idx').on(t.flagId),
  index('ff_change_history_actor_user_id_idx').on(t.actorUserId),
]);

export const authProjectConfigs = sqliteTable('auth_project_configs', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  nativeAuthEnabled: bool('native_auth_enabled', true),
  emailPasswordEnabled: bool('email_password_enabled', true),
  accessTokenTtlMinutes: integer('access_token_ttl_minutes').notNull().default(15),
  refreshTokenTtlDays: integer('refresh_token_ttl_days').notNull().default(30),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('auth_project_configs_project_id_uk').on(t.projectId)]);

export const authEndUsers = sqliteTable('auth_end_users', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  displayName: text('display_name'),
  emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp_ms' }),
  disabledAt: integer('disabled_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('auth_end_users_project_email_uk').on(t.projectId, t.email)]);

export const authIdentities = sqliteTable('auth_identities', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  endUserId: text('end_user_id')
    .notNull()
    .references(() => authEndUsers.id, { onDelete: 'cascade' }),
  provider: text('provider').$type<AuthIdentityProvider>().notNull(),
  providerSubject: text('provider_subject').notNull(),
  passwordHash: text('password_hash'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('auth_identities_project_provider_subject_uk').on(
    t.projectId,
    t.provider,
    t.providerSubject,
  ),
  index('auth_identities_end_user_id_idx').on(t.endUserId),
]);

export const authSessions = sqliteTable('auth_sessions', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  endUserId: text('end_user_id')
    .notNull()
    .references(() => authEndUsers.id, { onDelete: 'cascade' }),
  sessionTokenHash: text('session_token_hash').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('auth_sessions_token_hash_uk').on(t.sessionTokenHash),
  index('auth_sessions_project_end_user_idx').on(t.projectId, t.endUserId),
  index('auth_sessions_expires_at_idx').on(t.expiresAt),
  index('auth_sessions_revoked_expires_idx').on(t.revokedAt, t.expiresAt),
]);

export const authRefreshTokens = sqliteTable('auth_refresh_tokens', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  endUserId: text('end_user_id')
    .notNull()
    .references(() => authEndUsers.id, { onDelete: 'cascade' }),
  sessionId: text('session_id')
    .notNull()
    .references(() => authSessions.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  rotatedFromId: text('rotated_from_id'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('auth_refresh_tokens_token_hash_uk').on(t.tokenHash),
  index('auth_refresh_tokens_project_end_user_idx').on(t.projectId, t.endUserId),
  index('auth_refresh_tokens_session_id_idx').on(t.sessionId),
  index('auth_refresh_tokens_expires_at_idx').on(t.expiresAt),
]);

export const authSigningKeys = sqliteTable('auth_signing_keys', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  kid: text('kid').notNull(),
  algorithm: text('algorithm').notNull(),
  publicKeyPem: text('public_key_pem').notNull(),
  privateKeyCiphertext: blobBuf('private_key_ciphertext').notNull(),
  privateKeyIv: blobBuf('private_key_iv').notNull(),
  privateKeyTag: blobBuf('private_key_tag').notNull(),
  keyVersion: text('key_version').notNull(),
  active: bool('active', false),
  createdAt: createdAt(),
  retiredAt: integer('retired_at', { mode: 'timestamp_ms' }),
}, (t) => [
  uniqueIndex('auth_signing_keys_project_kid_uk').on(t.projectId, t.kid),
  index('auth_signing_keys_active_idx').on(t.projectId, t.active, t.retiredAt),
  index('auth_signing_keys_jwks_idx').on(t.projectId, t.retiredAt, t.createdAt),
]);

export const authPasswordResetTokens = sqliteTable('auth_password_reset_tokens', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  endUserId: text('end_user_id')
    .notNull()
    .references(() => authEndUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('auth_password_reset_tokens_token_hash_uk').on(t.tokenHash),
  index('auth_password_reset_tokens_project_end_user_idx').on(t.projectId, t.endUserId),
  index('auth_password_reset_tokens_expires_at_idx').on(t.expiresAt),
]);

export const authEmailVerificationTokens = sqliteTable('auth_email_verification_tokens', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  endUserId: text('end_user_id')
    .notNull()
    .references(() => authEndUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('auth_email_verification_tokens_token_hash_uk').on(t.tokenHash),
  index('auth_email_verification_tokens_project_end_user_idx').on(
    t.projectId,
    t.endUserId,
  ),
  index('auth_email_verification_tokens_expires_at_idx').on(t.expiresAt),
]);

export const authClients = sqliteTable('auth_clients', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<AuthClientType>().notNull(),
  clientId: text('client_id').notNull(),
  clientSecretHash: text('client_secret_hash'),
  redirectUrisJson: jsonText<string[]>('redirect_uris_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (t) => [
  uniqueIndex('auth_clients_client_id_uk').on(t.clientId),
  index('auth_clients_project_deleted_idx').on(t.projectId, t.deletedAt),
]);

export const authProviderConfigs = sqliteTable('auth_provider_configs', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  provider: text('provider').$type<AuthIdentityProvider>().notNull(),
  enabled: bool('enabled', true),
  clientId: text('client_id').notNull(),
  clientSecretCiphertext: blobBuf('client_secret_ciphertext').notNull(),
  clientSecretIv: blobBuf('client_secret_iv').notNull(),
  clientSecretTag: blobBuf('client_secret_tag').notNull(),
  keyVersion: text('key_version').notNull(),
  scopesJson: jsonText<string[]>('scopes_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('auth_provider_configs_project_provider_uk').on(t.projectId, t.provider),
  index('auth_provider_configs_project_enabled_idx').on(t.projectId, t.enabled),
]);

// Relations (for drizzle relational queries + better-auth joins)
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(projectMembers),
  organizationMemberships: many(organizationMembers),
  createdApiTokens: many(apiTokens),
  createdGlobalCliTokens: many(globalCliTokens),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  project: one(projects, { fields: [apiTokens.projectId], references: [projects.id] }),
  creator: one(users, { fields: [apiTokens.createdBy], references: [users.id] }),
}));

export const globalCliTokensRelations = relations(globalCliTokens, ({ one }) => ({
  creator: one(users, { fields: [globalCliTokens.createdBy], references: [users.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, { fields: [session.userId], references: [users.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, { fields: [account.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  members: many(projectMembers),
  environments: many(environments),
  modules: many(projectModules),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, {
    fields: [environments.projectId],
    references: [projects.id],
  }),
  secrets: many(secrets),
  featureFlagEnvironmentConfigs: many(featureFlagEnvironmentConfigs),
}));

export const featureFlagsRelations = relations(featureFlags, ({ one, many }) => ({
  project: one(projects, {
    fields: [featureFlags.projectId],
    references: [projects.id],
  }),
  environmentConfigs: many(featureFlagEnvironmentConfigs),
}));

export const featureFlagEnvironmentConfigsRelations = relations(
  featureFlagEnvironmentConfigs,
  ({ one }) => ({
    flag: one(featureFlags, {
      fields: [featureFlagEnvironmentConfigs.flagId],
      references: [featureFlags.id],
    }),
    environment: one(environments, {
      fields: [featureFlagEnvironmentConfigs.environmentId],
      references: [environments.id],
    }),
  }),
);

export const secretsRelations = relations(secrets, ({ one, many }) => ({
  environment: one(environments, {
    fields: [secrets.environmentId],
    references: [environments.id],
  }),
  versions: many(secretVersions),
}));

export const secretVersionsRelations = relations(secretVersions, ({ one }) => ({
  secret: one(secrets, {
    fields: [secretVersions.secretId],
    references: [secrets.id],
  }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  endUser: one(authEndUsers, {
    fields: [authSessions.endUserId],
    references: [authEndUsers.id],
  }),
  project: one(projects, {
    fields: [authSessions.projectId],
    references: [projects.id],
  }),
}));

export const authEndUsersRelations = relations(authEndUsers, ({ one, many }) => ({
  project: one(projects, {
    fields: [authEndUsers.projectId],
    references: [projects.id],
  }),
  identities: many(authIdentities),
  sessions: many(authSessions),
}));

export const authIdentitiesRelations = relations(authIdentities, ({ one }) => ({
  endUser: one(authEndUsers, {
    fields: [authIdentities.endUserId],
    references: [authEndUsers.id],
  }),
  project: one(projects, {
    fields: [authIdentities.projectId],
    references: [projects.id],
  }),
}));

export const serviceAccountsRelations = relations(serviceAccounts, ({ one, many }) => ({
  project: one(projects, {
    fields: [serviceAccounts.projectId],
    references: [projects.id],
  }),
  tokens: many(serviceAccountTokens),
  environments: many(serviceAccountEnvironments),
}));

export const serviceAccountTokensRelations = relations(
  serviceAccountTokens,
  ({ one, many }) => ({
    serviceAccount: one(serviceAccounts, {
      fields: [serviceAccountTokens.serviceAccountId],
      references: [serviceAccounts.id],
    }),
    environments: many(serviceAccountTokenEnvironments),
  }),
);

export const serviceAccountEnvironmentsRelations = relations(
  serviceAccountEnvironments,
  ({ one }) => ({
    serviceAccount: one(serviceAccounts, {
      fields: [serviceAccountEnvironments.serviceAccountId],
      references: [serviceAccounts.id],
    }),
    environment: one(environments, {
      fields: [serviceAccountEnvironments.environmentId],
      references: [environments.id],
    }),
  }),
);

export const serviceAccountTokenEnvironmentsRelations = relations(
  serviceAccountTokenEnvironments,
  ({ one }) => ({
    serviceAccountToken: one(serviceAccountTokens, {
      fields: [serviceAccountTokenEnvironments.serviceAccountTokenId],
      references: [serviceAccountTokens.id],
    }),
    environment: one(environments, {
      fields: [serviceAccountTokenEnvironments.environmentId],
      references: [environments.id],
    }),
  }),
);
