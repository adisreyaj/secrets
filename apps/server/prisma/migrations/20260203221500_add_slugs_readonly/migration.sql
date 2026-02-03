ALTER TABLE `projects`
  ADD COLUMN `slug` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `projects_slug_key` (`slug`);

ALTER TABLE `environments`
  ADD COLUMN `slug` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `environments_project_id_slug_key` (`project_id`, `slug`);

ALTER TABLE `api_tokens`
  ADD COLUMN `read_only` BOOLEAN NOT NULL DEFAULT false;
