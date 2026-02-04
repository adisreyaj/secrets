-- AlterTable
ALTER TABLE `approval_requests` MODIFY `payload_iv` LONGBLOB NULL,
    MODIFY `payload_tag` LONGBLOB NULL;

-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `actor_service_account_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `cli_login_sessions` MODIFY `token` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `service_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_accounts_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_account_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `service_account_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `read_only` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,

    INDEX `service_account_tokens_service_account_id_idx`(`service_account_id`),
    INDEX `service_account_tokens_token_hash_idx`(`token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_account_environments` (
    `service_account_id` VARCHAR(191) NOT NULL,
    `environment_id` VARCHAR(191) NOT NULL,

    INDEX `service_account_environments_environment_id_idx`(`environment_id`),
    PRIMARY KEY (`service_account_id`, `environment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_account_token_environments` (
    `service_account_token_id` VARCHAR(191) NOT NULL,
    `environment_id` VARCHAR(191) NOT NULL,

    INDEX `service_account_token_environments_environment_id_idx`(`environment_id`),
    PRIMARY KEY (`service_account_token_id`, `environment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `audit_logs_actor_service_account_id_idx` ON `audit_logs`(`actor_service_account_id`);

-- AddForeignKey
ALTER TABLE `service_accounts` ADD CONSTRAINT `service_accounts_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_accounts` ADD CONSTRAINT `service_accounts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_account_tokens` ADD CONSTRAINT `service_account_tokens_service_account_id_fkey` FOREIGN KEY (`service_account_id`) REFERENCES `service_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_account_environments` ADD CONSTRAINT `service_account_environments_service_account_id_fkey` FOREIGN KEY (`service_account_id`) REFERENCES `service_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_account_environments` ADD CONSTRAINT `service_account_environments_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_account_token_environments` ADD CONSTRAINT `service_account_token_environments_service_account_token_id_fkey` FOREIGN KEY (`service_account_token_id`) REFERENCES `service_account_tokens`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_account_token_environments` ADD CONSTRAINT `service_account_token_environments_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_service_account_id_fkey` FOREIGN KEY (`actor_service_account_id`) REFERENCES `service_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
