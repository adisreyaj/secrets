-- CreateTable
CREATE TABLE `global_cli_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `global_cli_tokens_token_hash_idx`(`token_hash`),
    INDEX `global_cli_tokens_created_by_idx`(`created_by`),
    INDEX `global_cli_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `global_cli_tokens`
ADD CONSTRAINT `global_cli_tokens_created_by_fkey`
FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
