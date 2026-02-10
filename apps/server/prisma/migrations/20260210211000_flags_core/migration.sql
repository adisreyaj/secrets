-- CreateTable
CREATE TABLE `feature_flags` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `value_type` ENUM('BOOLEAN', 'MULTIVARIATE') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `feature_flags_project_id_key_key`(`project_id`, `key`),
    INDEX `feature_flags_project_id_enabled_idx`(`project_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_variants` (
    `id` VARCHAR(191) NOT NULL,
    `flag_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `weight` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feature_flag_variants_flag_id_key_key`(`flag_id`, `key`),
    INDEX `feature_flag_variants_flag_id_idx`(`flag_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_rules` (
    `id` VARCHAR(191) NOT NULL,
    `flag_id` VARCHAR(191) NOT NULL,
    `priority` INTEGER NOT NULL,
    `rollout_percentage` INTEGER NOT NULL DEFAULT 100,
    `variant_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `feature_flag_rules_flag_id_priority_idx`(`flag_id`, `priority`),
    INDEX `feature_flag_rules_variant_id_idx`(`variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_env_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `flag_id` VARCHAR(191) NOT NULL,
    `environment_id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NULL,
    `variant_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feature_flag_env_overrides_flag_id_environment_id_key`(`flag_id`, `environment_id`),
    INDEX `feature_flag_env_overrides_environment_id_idx`(`environment_id`),
    INDEX `feature_flag_env_overrides_variant_id_idx`(`variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feature_flags`
ADD CONSTRAINT `feature_flags_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_variants`
ADD CONSTRAINT `feature_flag_variants_flag_id_fkey`
FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_rules`
ADD CONSTRAINT `feature_flag_rules_flag_id_fkey`
FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_rules`
ADD CONSTRAINT `feature_flag_rules_variant_id_fkey`
FOREIGN KEY (`variant_id`) REFERENCES `feature_flag_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_env_overrides`
ADD CONSTRAINT `feature_flag_env_overrides_flag_id_fkey`
FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_env_overrides`
ADD CONSTRAINT `feature_flag_env_overrides_environment_id_fkey`
FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_env_overrides`
ADD CONSTRAINT `feature_flag_env_overrides_variant_id_fkey`
FOREIGN KEY (`variant_id`) REFERENCES `feature_flag_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
