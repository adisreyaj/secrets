-- CreateTable
CREATE TABLE `feature_flag_sdk_keys` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `key_prefix` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,

    INDEX `feature_flag_sdk_keys_project_id_idx`(`project_id`),
    INDEX `feature_flag_sdk_keys_token_hash_idx`(`token_hash`),
    INDEX `feature_flag_sdk_keys_revoked_at_idx`(`revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_change_history` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `flag_id` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource_type` VARCHAR(191) NOT NULL,
    `resource_id` VARCHAR(191) NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feature_flag_change_history_project_id_created_at_idx`(`project_id`, `created_at`),
    INDEX `feature_flag_change_history_flag_id_idx`(`flag_id`),
    INDEX `feature_flag_change_history_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feature_flag_sdk_keys`
ADD CONSTRAINT `feature_flag_sdk_keys_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_sdk_keys`
ADD CONSTRAINT `feature_flag_sdk_keys_created_by_fkey`
FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_change_history`
ADD CONSTRAINT `feature_flag_change_history_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_change_history`
ADD CONSTRAINT `feature_flag_change_history_flag_id_fkey`
FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_change_history`
ADD CONSTRAINT `feature_flag_change_history_actor_user_id_fkey`
FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
