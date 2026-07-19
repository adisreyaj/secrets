CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_tokens_project_id_idx` ON `api_tokens` (`project_id`);--> statement-breakpoint
CREATE INDEX `api_tokens_project_created_idx` ON `api_tokens` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `api_tokens_token_hash_idx` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_expires_at_idx` ON `api_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`secret_id` text,
	`action` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`requested_by` text NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`denied_at` integer,
	`canceled_at` integer,
	`key` text NOT NULL,
	`payload_ciphertext` blob,
	`payload_iv` blob,
	`payload_tag` blob,
	`payload_key_version` text,
	`target_environment_id` text,
	`expected_version_id` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `approval_requests_project_status_idx` ON `approval_requests` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `approval_requests_project_status_created_idx` ON `approval_requests` (`project_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `approval_requests_pending_lookup_idx` ON `approval_requests` (`project_id`,`environment_id`,`action`,`status`,`key`);--> statement-breakpoint
CREATE INDEX `approval_requests_status_created_idx` ON `approval_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `approval_requests_env_status_idx` ON `approval_requests` (`environment_id`,`status`);--> statement-breakpoint
CREATE INDEX `approval_requests_requested_by_status_idx` ON `approval_requests` (`requested_by`,`status`);--> statement-breakpoint
CREATE INDEX `approval_requests_secret_status_idx` ON `approval_requests` (`secret_id`,`status`);--> statement-breakpoint
CREATE INDEX `approval_requests_action_idx` ON `approval_requests` (`action`);--> statement-breakpoint
CREATE TABLE `approval_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`environment_id` text,
	`key_pattern` text NOT NULL,
	`actions_json` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approval_rules_project_id_idx` ON `approval_rules` (`project_id`);--> statement-breakpoint
CREATE INDEX `approval_rules_environment_id_idx` ON `approval_rules` (`environment_id`);--> statement-breakpoint
CREATE INDEX `approval_rules_is_active_idx` ON `approval_rules` (`is_active`);--> statement-breakpoint
CREATE INDEX `approval_rules_project_active_env_idx` ON `approval_rules` (`project_id`,`is_active`,`environment_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_user_id` text,
	`actor_service_account_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_service_account_id`) REFERENCES `service_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_user_id_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_project_created_idx` ON `audit_logs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_resource_idx` ON `audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_sa_id_idx` ON `audit_logs` (`actor_service_account_id`);--> statement-breakpoint
CREATE TABLE `auth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_hash` text,
	`redirect_uris_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_clients_client_id_uk` ON `auth_clients` (`client_id`);--> statement-breakpoint
CREATE INDEX `auth_clients_project_deleted_idx` ON `auth_clients` (`project_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `auth_email_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`end_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_email_verification_tokens_token_hash_uk` ON `auth_email_verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_email_verification_tokens_project_end_user_idx` ON `auth_email_verification_tokens` (`project_id`,`end_user_id`);--> statement-breakpoint
CREATE INDEX `auth_email_verification_tokens_expires_at_idx` ON `auth_email_verification_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_end_users` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`email_verified_at` integer,
	`disabled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_end_users_project_email_uk` ON `auth_end_users` (`project_id`,`email`);--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`end_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`password_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_project_provider_subject_uk` ON `auth_identities` (`project_id`,`provider`,`provider_subject`);--> statement-breakpoint
CREATE INDEX `auth_identities_end_user_id_idx` ON `auth_identities` (`end_user_id`);--> statement-breakpoint
CREATE TABLE `auth_password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`end_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_password_reset_tokens_token_hash_uk` ON `auth_password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_password_reset_tokens_project_end_user_idx` ON `auth_password_reset_tokens` (`project_id`,`end_user_id`);--> statement-breakpoint
CREATE INDEX `auth_password_reset_tokens_expires_at_idx` ON `auth_password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_project_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`native_auth_enabled` integer DEFAULT true NOT NULL,
	`email_password_enabled` integer DEFAULT true NOT NULL,
	`access_token_ttl_minutes` integer DEFAULT 15 NOT NULL,
	`refresh_token_ttl_days` integer DEFAULT 30 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_project_configs_project_id_uk` ON `auth_project_configs` (`project_id`);--> statement-breakpoint
CREATE TABLE `auth_provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_ciphertext` blob NOT NULL,
	`client_secret_iv` blob NOT NULL,
	`client_secret_tag` blob NOT NULL,
	`key_version` text NOT NULL,
	`scopes_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_provider_configs_project_provider_uk` ON `auth_provider_configs` (`project_id`,`provider`);--> statement-breakpoint
CREATE INDEX `auth_provider_configs_project_enabled_idx` ON `auth_provider_configs` (`project_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `auth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`end_user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`rotated_from_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_refresh_tokens_token_hash_uk` ON `auth_refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_refresh_tokens_project_end_user_idx` ON `auth_refresh_tokens` (`project_id`,`end_user_id`);--> statement-breakpoint
CREATE INDEX `auth_refresh_tokens_session_id_idx` ON `auth_refresh_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `auth_refresh_tokens_expires_at_idx` ON `auth_refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`end_user_id` text NOT NULL,
	`session_token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`last_seen_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_uk` ON `auth_sessions` (`session_token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_project_end_user_idx` ON `auth_sessions` (`project_id`,`end_user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `auth_sessions_revoked_expires_idx` ON `auth_sessions` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_signing_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kid` text NOT NULL,
	`algorithm` text NOT NULL,
	`public_key_pem` text NOT NULL,
	`private_key_ciphertext` blob NOT NULL,
	`private_key_iv` blob NOT NULL,
	`private_key_tag` blob NOT NULL,
	`key_version` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`retired_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_signing_keys_project_kid_uk` ON `auth_signing_keys` (`project_id`,`kid`);--> statement-breakpoint
CREATE INDEX `auth_signing_keys_active_idx` ON `auth_signing_keys` (`project_id`,`active`,`retired_at`);--> statement-breakpoint
CREATE INDEX `auth_signing_keys_jwks_idx` ON `auth_signing_keys` (`project_id`,`retired_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `cli_login_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`token` text,
	`user_id` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_login_sessions_code_uk` ON `cli_login_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `cli_login_sessions_user_id_idx` ON `cli_login_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `cli_login_sessions_expires_at_idx` ON `cli_login_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `cli_login_sessions_consumed_at_idx` ON `cli_login_sessions` (`consumed_at`);--> statement-breakpoint
CREATE TABLE `environments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`encrypted_dek` blob,
	`encrypted_dek_backup` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `environments_project_name_uk` ON `environments` (`project_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `environments_project_slug_uk` ON `environments` (`project_id`,`slug`);--> statement-breakpoint
CREATE INDEX `environments_project_created_idx` ON `environments` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `feature_flag_change_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`flag_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ff_change_history_project_created_idx` ON `feature_flag_change_history` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ff_change_history_flag_id_idx` ON `feature_flag_change_history` (`flag_id`);--> statement-breakpoint
CREATE INDEX `ff_change_history_actor_user_id_idx` ON `feature_flag_change_history` (`actor_user_id`);--> statement-breakpoint
CREATE TABLE `feature_flag_environment_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`flag_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`value_type` text NOT NULL,
	`boolean_value` integer,
	`json_value` text,
	`runtime` text DEFAULT 'BOTH' NOT NULL,
	`labels_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ff_env_cfg_flag_env_uk` ON `feature_flag_environment_configs` (`flag_id`,`environment_id`);--> statement-breakpoint
CREATE INDEX `ff_env_cfg_env_idx` ON `feature_flag_environment_configs` (`environment_id`);--> statement-breakpoint
CREATE TABLE `feature_flag_sdk_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ff_sdk_keys_project_id_idx` ON `feature_flag_sdk_keys` (`project_id`);--> statement-breakpoint
CREATE INDEX `ff_sdk_keys_project_created_idx` ON `feature_flag_sdk_keys` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ff_sdk_keys_token_hash_idx` ON `feature_flag_sdk_keys` (`token_hash`);--> statement-breakpoint
CREATE INDEX `ff_sdk_keys_revoked_at_idx` ON `feature_flag_sdk_keys` (`revoked_at`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`value_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flags_project_key_uk` ON `feature_flags` (`project_id`,`key`);--> statement-breakpoint
CREATE INDEX `ff_project_deleted_created_idx` ON `feature_flags` (`project_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `global_cli_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `global_cli_tokens_token_hash_idx` ON `global_cli_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `global_cli_tokens_created_by_idx` ON `global_cli_tokens` (`created_by`);--> statement-breakpoint
CREATE INDEX `global_cli_tokens_expires_at_idx` ON `global_cli_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `global_cli_tokens_revoked_deleted_idx` ON `global_cli_tokens` (`revoked_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_members_org_user_uk` ON `organization_members` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `organization_members_user_id_idx` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uk` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `project_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_invites_project_id_idx` ON `project_invites` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_invites_project_created_idx` ON `project_invites` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `project_invites_lookup_idx` ON `project_invites` (`project_id`,`email`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `project_invites_email_idx` ON `project_invites` (`email`);--> statement-breakpoint
CREATE INDEX `project_invites_token_hash_idx` ON `project_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `project_invites_status_idx` ON `project_invites` (`status`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_project_user_uk` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_members_user_id_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `project_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`module` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_modules_project_module_uk` ON `project_modules` (`project_id`,`module`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`slug` text,
	`audit_retention_days` integer DEFAULT 90,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_uk` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_organization_id_idx` ON `projects` (`organization_id`);--> statement-breakpoint
CREATE TABLE `secret_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_id` text NOT NULL,
	`ciphertext` blob NOT NULL,
	`iv` blob NOT NULL,
	`tag` blob NOT NULL,
	`key_version` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `secret_versions_secret_active_idx` ON `secret_versions` (`secret_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `secret_versions_secret_created_idx` ON `secret_versions` (`secret_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`environment_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_environment_key_uk` ON `secrets` (`environment_id`,`key`);--> statement-breakpoint
CREATE INDEX `secrets_environment_deleted_idx` ON `secrets` (`environment_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `service_account_environments` (
	`service_account_id` text NOT NULL,
	`environment_id` text NOT NULL,
	PRIMARY KEY(`service_account_id`, `environment_id`),
	FOREIGN KEY (`service_account_id`) REFERENCES `service_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sa_environments_env_idx` ON `service_account_environments` (`environment_id`);--> statement-breakpoint
CREATE TABLE `service_account_token_environments` (
	`service_account_token_id` text NOT NULL,
	`environment_id` text NOT NULL,
	PRIMARY KEY(`service_account_token_id`, `environment_id`),
	FOREIGN KEY (`service_account_token_id`) REFERENCES `service_account_tokens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sa_token_environments_env_idx` ON `service_account_token_environments` (`environment_id`);--> statement-breakpoint
CREATE TABLE `service_account_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`service_account_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`token_hash` text NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`service_account_id`) REFERENCES `service_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_account_tokens_sa_id_idx` ON `service_account_tokens` (`service_account_id`);--> statement-breakpoint
CREATE INDEX `service_account_tokens_token_hash_idx` ON `service_account_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `service_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_accounts_project_id_idx` ON `service_accounts` (`project_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_uk` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uk` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);