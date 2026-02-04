-- AlterTable
ALTER TABLE `projects` ADD COLUMN `audit_retention_days` INTEGER NULL DEFAULT 90;

-- Backfill existing projects
UPDATE `projects` SET `audit_retention_days` = 90 WHERE `audit_retention_days` IS NULL;
