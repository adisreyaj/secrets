-- AlterTable
ALTER TABLE `api_tokens` ADD COLUMN `expires_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `cli_login_sessions` MODIFY `token` VARCHAR(191) NULL;
