-- CreateTable
CREATE TABLE `auth_provider_configs` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('LOCAL', 'GOOGLE', 'GITHUB') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `client_id` VARCHAR(191) NOT NULL,
    `client_secret_ciphertext` LONGBLOB NOT NULL,
    `client_secret_iv` LONGBLOB NOT NULL,
    `client_secret_tag` LONGBLOB NOT NULL,
    `key_version` VARCHAR(191) NOT NULL,
    `scopes_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_provider_configs_project_id_provider_key`(`project_id`, `provider`),
    INDEX `auth_provider_configs_project_id_enabled_idx`(`project_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_provider_configs`
ADD CONSTRAINT `auth_provider_configs_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
