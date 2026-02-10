-- CreateTable
CREATE TABLE `auth_project_configs` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `native_auth_enabled` BOOLEAN NOT NULL DEFAULT true,
    `email_password_enabled` BOOLEAN NOT NULL DEFAULT true,
    `access_token_ttl_minutes` INTEGER NOT NULL DEFAULT 15,
    `refresh_token_ttl_days` INTEGER NOT NULL DEFAULT 30,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_project_configs_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_end_users` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NULL,
    `email_verified_at` DATETIME(3) NULL,
    `disabled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_end_users_project_id_email_key`(`project_id`, `email`),
    INDEX `auth_end_users_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_identities` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `end_user_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('LOCAL', 'GOOGLE', 'GITHUB') NOT NULL,
    `provider_subject` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_identities_project_id_provider_provider_subject_key`(`project_id`, `provider`, `provider_subject`),
    INDEX `auth_identities_end_user_id_idx`(`end_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `end_user_id` VARCHAR(191) NOT NULL,
    `session_token_hash` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NULL,
    `ip_address` VARCHAR(191) NULL,
    `last_seen_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_session_token_hash_key`(`session_token_hash`),
    INDEX `auth_sessions_project_id_end_user_id_idx`(`project_id`, `end_user_id`),
    INDEX `auth_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `end_user_id` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `rotated_from_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `auth_refresh_tokens_project_id_end_user_id_idx`(`project_id`, `end_user_id`),
    INDEX `auth_refresh_tokens_session_id_idx`(`session_id`),
    INDEX `auth_refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_project_configs`
ADD CONSTRAINT `auth_project_configs_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_end_users`
ADD CONSTRAINT `auth_end_users_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_identities`
ADD CONSTRAINT `auth_identities_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_identities`
ADD CONSTRAINT `auth_identities_end_user_id_fkey`
FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions`
ADD CONSTRAINT `auth_sessions_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions`
ADD CONSTRAINT `auth_sessions_end_user_id_fkey`
FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_refresh_tokens`
ADD CONSTRAINT `auth_refresh_tokens_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_refresh_tokens`
ADD CONSTRAINT `auth_refresh_tokens_end_user_id_fkey`
FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_refresh_tokens`
ADD CONSTRAINT `auth_refresh_tokens_session_id_fkey`
FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_refresh_tokens`
ADD CONSTRAINT `auth_refresh_tokens_rotated_from_id_fkey`
FOREIGN KEY (`rotated_from_id`) REFERENCES `auth_refresh_tokens`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
