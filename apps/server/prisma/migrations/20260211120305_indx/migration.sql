-- DropIndex
DROP INDEX `cli_login_sessions_code_idx` ON `cli_login_sessions`;

-- DropIndex
DROP INDEX `secret_versions_is_active_idx` ON `secret_versions`;

-- CreateIndex
CREATE INDEX `api_tokens_expires_at_idx` ON `api_tokens`(`expires_at`);

-- CreateIndex
CREATE INDEX `approval_requests_status_created_at_idx` ON `approval_requests`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `audit_logs_project_id_created_at_idx` ON `audit_logs`(`project_id`, `created_at`);

-- CreateIndex
CREATE INDEX `audit_logs_resource_type_resource_id_idx` ON `audit_logs`(`resource_type`, `resource_id`);

-- CreateIndex
CREATE INDEX `auth_sessions_revoked_at_expires_at_idx` ON `auth_sessions`(`revoked_at`, `expires_at`);

-- CreateIndex
CREATE INDEX `cli_login_sessions_consumed_at_idx` ON `cli_login_sessions`(`consumed_at`);

-- CreateIndex
CREATE INDEX `feature_flags_project_id_deleted_at_idx` ON `feature_flags`(`project_id`, `deleted_at`);

-- CreateIndex
CREATE INDEX `global_cli_tokens_revoked_at_deleted_at_idx` ON `global_cli_tokens`(`revoked_at`, `deleted_at`);

-- CreateIndex
CREATE INDEX `secret_versions_secret_id_is_active_idx` ON `secret_versions`(`secret_id`, `is_active`);

-- CreateIndex
CREATE INDEX `secrets_environment_id_deleted_at_idx` ON `secrets`(`environment_id`, `deleted_at`);
