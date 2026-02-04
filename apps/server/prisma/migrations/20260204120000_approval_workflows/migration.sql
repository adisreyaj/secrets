CREATE TABLE `approval_rules` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `environment_id` VARCHAR(191) NULL,
    `key_pattern` VARCHAR(191) NOT NULL,
    `actions_json` JSON NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `approval_rules_project_id_idx`(`project_id`),
    INDEX `approval_rules_environment_id_idx`(`environment_id`),
    INDEX `approval_rules_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `approval_requests` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `environment_id` VARCHAR(191) NOT NULL,
    `secret_id` VARCHAR(191) NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'ROLLBACK', 'COPY', 'COPY_FROM') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `requested_by` VARCHAR(191) NOT NULL,
    `approved_by` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `denied_at` DATETIME(3) NULL,
    `canceled_at` DATETIME(3) NULL,
    `key` VARCHAR(191) NOT NULL,
    `payload_ciphertext` LONGBLOB NULL,
    `payload_iv` VARBINARY(191) NULL,
    `payload_tag` VARBINARY(191) NULL,
    `payload_key_version` VARCHAR(191) NULL,
    `target_environment_id` VARCHAR(191) NULL,
    `expected_version_id` VARCHAR(191) NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `approval_requests_project_id_status_idx`(`project_id`, `status`),
    INDEX `approval_requests_environment_id_status_idx`(`environment_id`, `status`),
    INDEX `approval_requests_requested_by_status_idx`(`requested_by`, `status`),
    INDEX `approval_requests_secret_id_status_idx`(`secret_id`, `status`),
    INDEX `approval_requests_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `approval_rules`
ADD CONSTRAINT `approval_rules_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_rules`
ADD CONSTRAINT `approval_rules_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_rules`
ADD CONSTRAINT `approval_rules_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_requests`
ADD CONSTRAINT `approval_requests_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_requests`
ADD CONSTRAINT `approval_requests_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_requests`
ADD CONSTRAINT `approval_requests_secret_id_fkey` FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_requests`
ADD CONSTRAINT `approval_requests_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `approval_requests`
ADD CONSTRAINT `approval_requests_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
