-- CreateTable
CREATE TABLE `auth_signing_keys` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `kid` VARCHAR(191) NOT NULL,
    `algorithm` VARCHAR(191) NOT NULL,
    `public_key_pem` TEXT NOT NULL,
    `private_key_ciphertext` LONGBLOB NOT NULL,
    `private_key_iv` LONGBLOB NOT NULL,
    `private_key_tag` LONGBLOB NOT NULL,
    `key_version` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `retired_at` DATETIME(3) NULL,

    UNIQUE INDEX `auth_signing_keys_project_id_kid_key`(`project_id`, `kid`),
    INDEX `auth_signing_keys_project_id_active_idx`(`project_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `end_user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `auth_password_reset_tokens_project_id_end_user_id_idx`(`project_id`, `end_user_id`),
    INDEX `auth_password_reset_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_email_verification_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `end_user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_email_verification_tokens_token_hash_key`(`token_hash`),
    INDEX `auth_email_verification_tokens_project_id_end_user_id_idx`(`project_id`, `end_user_id`),
    INDEX `auth_email_verification_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_clients` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('PUBLIC', 'CONFIDENTIAL') NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `client_secret_hash` VARCHAR(191) NULL,
    `redirect_uris_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `auth_clients_client_id_key`(`client_id`),
    INDEX `auth_clients_project_id_deleted_at_idx`(`project_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_signing_keys`
ADD CONSTRAINT `auth_signing_keys_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_password_reset_tokens`
ADD CONSTRAINT `auth_password_reset_tokens_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_password_reset_tokens`
ADD CONSTRAINT `auth_password_reset_tokens_end_user_id_fkey`
FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_email_verification_tokens`
ADD CONSTRAINT `auth_email_verification_tokens_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_email_verification_tokens`
ADD CONSTRAINT `auth_email_verification_tokens_end_user_id_fkey`
FOREIGN KEY (`end_user_id`) REFERENCES `auth_end_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_clients`
ADD CONSTRAINT `auth_clients_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
