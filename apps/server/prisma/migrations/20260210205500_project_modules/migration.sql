-- CreateTable
CREATE TABLE `project_modules` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `module` ENUM('SECRETS', 'FLAGS', 'AUTH') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_modules_project_id_module_key`(`project_id`, `module`),
    INDEX `project_modules_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_modules`
ADD CONSTRAINT `project_modules_project_id_fkey`
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SeedDefaults
INSERT INTO `project_modules` (`id`, `project_id`, `module`, `enabled`, `created_at`, `updated_at`)
SELECT UUID(), p.`id`, 'SECRETS', TRUE, NOW(3), NOW(3)
FROM `projects` p;

INSERT INTO `project_modules` (`id`, `project_id`, `module`, `enabled`, `created_at`, `updated_at`)
SELECT UUID(), p.`id`, 'FLAGS', TRUE, NOW(3), NOW(3)
FROM `projects` p;

INSERT INTO `project_modules` (`id`, `project_id`, `module`, `enabled`, `created_at`, `updated_at`)
SELECT UUID(), p.`id`, 'AUTH', TRUE, NOW(3), NOW(3)
FROM `projects` p;
