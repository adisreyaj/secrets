-- CreateTable
CREATE TABLE `feature_flag_environment_configs` (
  `id` VARCHAR(191) NOT NULL,
  `flag_id` VARCHAR(191) NOT NULL,
  `environment_id` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `value_type` ENUM('BOOLEAN', 'MULTIVARIATE') NOT NULL,
  `boolean_value` BOOLEAN NULL,
  `runtime` ENUM('BOTH', 'CLIENT', 'SERVER') NOT NULL DEFAULT 'BOTH',
  `labels_json` JSON NULL,
  `default_variant_key` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ff_env_cfg_flag_env_uk`(`flag_id`, `environment_id`),
  INDEX `ff_env_cfg_env_idx`(`environment_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_environment_variants` (
  `id` VARCHAR(191) NOT NULL,
  `environment_config_id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value_type` ENUM('STRING', 'JSON') NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  `order_index` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ff_env_var_cfg_key_uk`(`environment_config_id`, `key`),
  INDEX `ff_env_var_cfg_order_idx`(`environment_config_id`, `order_index`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feature_flag_environment_configs` ADD CONSTRAINT `feature_flag_environment_configs_flag_id_fkey` FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_environment_configs` ADD CONSTRAINT `feature_flag_environment_configs_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_environment_variants` ADD CONSTRAINT `feature_flag_environment_variants_environment_config_id_fkey` FOREIGN KEY (`environment_config_id`) REFERENCES `feature_flag_environment_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one explicit config per existing flag/environment
INSERT INTO `feature_flag_environment_configs` (
  `id`,
  `flag_id`,
  `environment_id`,
  `enabled`,
  `value_type`,
  `boolean_value`,
  `runtime`,
  `labels_json`,
  `default_variant_key`,
  `created_at`,
  `updated_at`
)
SELECT
  CONCAT('ffec_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 20)) AS `id`,
  ff.`id` AS `flag_id`,
  env.`id` AS `environment_id`,
  COALESCE(ovr.`enabled`, ff.`enabled`) AS `enabled`,
  ff.`value_type` AS `value_type`,
  CASE WHEN ff.`value_type` = 'BOOLEAN' THEN COALESCE(ovr.`enabled`, ff.`enabled`) ELSE NULL END AS `boolean_value`,
  'BOTH' AS `runtime`,
  JSON_ARRAY() AS `labels_json`,
  (
    SELECT v.`key`
    FROM `feature_flag_variants` v
    WHERE v.`flag_id` = ff.`id`
    ORDER BY v.`created_at` ASC, v.`id` ASC
    LIMIT 1
  ) AS `default_variant_key`,
  NOW(3) AS `created_at`,
  NOW(3) AS `updated_at`
FROM `feature_flags` ff
INNER JOIN `environments` env ON env.`project_id` = ff.`project_id`
LEFT JOIN `feature_flag_env_overrides` ovr
  ON ovr.`flag_id` = ff.`id` AND ovr.`environment_id` = env.`id`
WHERE ff.`deleted_at` IS NULL;

-- Backfill: copy legacy variants to each env config
INSERT INTO `feature_flag_environment_variants` (
  `id`,
  `environment_config_id`,
  `key`,
  `value_type`,
  `value`,
  `order_index`,
  `created_at`,
  `updated_at`
)
SELECT
  CONCAT('ffev_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 20)) AS `id`,
  cfg.`id` AS `environment_config_id`,
  v.`key`,
  'STRING' AS `value_type`,
  v.`value`,
  0 AS `order_index`,
  NOW(3) AS `created_at`,
  NOW(3) AS `updated_at`
FROM `feature_flag_environment_configs` cfg
INNER JOIN `feature_flag_variants` v ON v.`flag_id` = cfg.`flag_id`;
