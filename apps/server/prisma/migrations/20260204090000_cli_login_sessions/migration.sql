CREATE TABLE `cli_login_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `token` TEXT NULL,
    `user_id` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,

    UNIQUE INDEX `cli_login_sessions_code_key`(`code`),
    INDEX `cli_login_sessions_user_id_idx`(`user_id`),
    INDEX `cli_login_sessions_code_idx`(`code`),
    INDEX `cli_login_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cli_login_sessions` ADD CONSTRAINT `cli_login_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
