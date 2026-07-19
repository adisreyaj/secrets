export const Role = {
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const InviteStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  CANCELED: 'CANCELED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ApprovalAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  ROLLBACK: 'ROLLBACK',
  COPY: 'COPY',
  COPY_FROM: 'COPY_FROM',
} as const;
export type ApprovalAction = (typeof ApprovalAction)[keyof typeof ApprovalAction];

export const ProjectModuleKey = {
  SECRETS: 'SECRETS',
  FLAGS: 'FLAGS',
  AUTH: 'AUTH',
} as const;
export type ProjectModuleKey = (typeof ProjectModuleKey)[keyof typeof ProjectModuleKey];

export const FeatureFlagValueType = {
  BOOLEAN: 'BOOLEAN',
  JSON: 'JSON',
} as const;
export type FeatureFlagValueType =
  (typeof FeatureFlagValueType)[keyof typeof FeatureFlagValueType];

export const FeatureFlagRuntime = {
  BOTH: 'BOTH',
  CLIENT: 'CLIENT',
  SERVER: 'SERVER',
} as const;
export type FeatureFlagRuntime =
  (typeof FeatureFlagRuntime)[keyof typeof FeatureFlagRuntime];

export const AuthIdentityProvider = {
  LOCAL: 'LOCAL',
  GOOGLE: 'GOOGLE',
  GITHUB: 'GITHUB',
} as const;
export type AuthIdentityProvider =
  (typeof AuthIdentityProvider)[keyof typeof AuthIdentityProvider];

export const AuthClientType = {
  PUBLIC: 'PUBLIC',
  CONFIDENTIAL: 'CONFIDENTIAL',
} as const;
export type AuthClientType = (typeof AuthClientType)[keyof typeof AuthClientType];
