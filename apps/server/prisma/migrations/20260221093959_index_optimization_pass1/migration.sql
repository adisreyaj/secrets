-- DropForeignKey
ALTER TABLE `auth_signing_keys` DROP FOREIGN KEY `auth_signing_keys_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `feature_flags` DROP FOREIGN KEY `feature_flags_project_id_fkey`;

-- DropIndex
DROP INDEX `auth_signing_keys_project_id_active_idx` ON `auth_signing_keys`;

-- DropIndex
DROP INDEX `feature_flags_project_id_deleted_at_idx` ON `feature_flags`;

-- DropIndex
DROP INDEX `feature_flags_project_id_enabled_idx` ON `feature_flags`;

-- CreateIndex
CREATE INDEX `api_tokens_project_created_idx` ON `api_tokens`(`project_id`, `created_at`);

-- CreateIndex
CREATE INDEX `approval_requests_project_status_created_idx` ON `approval_requests`(`project_id`, `status`, `created_at`);

-- CreateIndex
CREATE INDEX `approval_requests_pending_lookup_idx` ON `approval_requests`(`project_id`, `environment_id`, `action`, `status`, `key`);

-- CreateIndex
CREATE INDEX `approval_rules_project_active_env_idx` ON `approval_rules`(`project_id`, `is_active`, `environment_id`);

-- CreateIndex
CREATE INDEX `auth_signing_keys_active_idx` ON `auth_signing_keys`(`project_id`, `active`, `retired_at`);

-- CreateIndex
CREATE INDEX `auth_signing_keys_jwks_idx` ON `auth_signing_keys`(`project_id`, `retired_at`, `created_at`);

-- CreateIndex
CREATE INDEX `environments_project_created_idx` ON `environments`(`project_id`, `created_at`);

-- CreateIndex
CREATE INDEX `ff_sdk_keys_project_created_idx` ON `feature_flag_sdk_keys`(`project_id`, `created_at`);

-- CreateIndex
CREATE INDEX `ff_project_deleted_created_idx` ON `feature_flags`(`project_id`, `deleted_at`, `created_at`);

-- CreateIndex
CREATE INDEX `project_invites_project_created_idx` ON `project_invites`(`project_id`, `created_at`);

-- CreateIndex
CREATE INDEX `project_invites_lookup_idx` ON `project_invites`(`project_id`, `email`, `status`, `expires_at`);

-- CreateIndex
CREATE INDEX `secret_versions_secret_created_idx` ON `secret_versions`(`secret_id`, `created_at`);

-- AddForeignKey
ALTER TABLE `auth_signing_keys` ADD CONSTRAINT `auth_signing_keys_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flags` ADD CONSTRAINT `feature_flags_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
