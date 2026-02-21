-- Ensure each non-deleted feature flag has config coverage across all project environments.
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
  COALESCE(base.`enabled`, ff.`enabled`) AS `enabled`,
  COALESCE(base.`value_type`, ff.`value_type`) AS `value_type`,
  CASE
    WHEN COALESCE(base.`value_type`, ff.`value_type`) = 'BOOLEAN'
      THEN COALESCE(base.`boolean_value`, ff.`enabled`)
    ELSE NULL
  END AS `boolean_value`,
  COALESCE(base.`runtime`, 'BOTH') AS `runtime`,
  COALESCE(base.`labels_json`, JSON_ARRAY()) AS `labels_json`,
  CASE
    WHEN COALESCE(base.`value_type`, ff.`value_type`) = 'MULTIVARIATE'
      THEN base.`default_variant_key`
    ELSE NULL
  END AS `default_variant_key`,
  NOW(3) AS `created_at`,
  NOW(3) AS `updated_at`
FROM `feature_flags` ff
INNER JOIN `environments` env ON env.`project_id` = ff.`project_id`
LEFT JOIN `feature_flag_environment_configs` target
  ON target.`flag_id` = ff.`id` AND target.`environment_id` = env.`id`
LEFT JOIN (
  SELECT cfg.*
  FROM `feature_flag_environment_configs` cfg
  INNER JOIN (
    SELECT `flag_id`, MIN(`created_at`) AS `min_created_at`
    FROM `feature_flag_environment_configs`
    GROUP BY `flag_id`
  ) first_cfg
    ON first_cfg.`flag_id` = cfg.`flag_id`
   AND first_cfg.`min_created_at` = cfg.`created_at`
) base ON base.`flag_id` = ff.`id`
WHERE ff.`deleted_at` IS NULL
  AND target.`id` IS NULL;

-- Backfill multivariate variants for configs that are missing variant rows.
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
  target.`id` AS `environment_config_id`,
  source_variant.`key`,
  source_variant.`value_type`,
  source_variant.`value`,
  source_variant.`order_index`,
  NOW(3) AS `created_at`,
  NOW(3) AS `updated_at`
FROM `feature_flag_environment_configs` target
INNER JOIN (
  SELECT cfg.*
  FROM `feature_flag_environment_configs` cfg
  INNER JOIN (
    SELECT `flag_id`, MIN(`created_at`) AS `min_created_at`
    FROM `feature_flag_environment_configs`
    GROUP BY `flag_id`
  ) first_cfg
    ON first_cfg.`flag_id` = cfg.`flag_id`
   AND first_cfg.`min_created_at` = cfg.`created_at`
) base ON base.`flag_id` = target.`flag_id`
INNER JOIN `feature_flag_environment_variants` source_variant
  ON source_variant.`environment_config_id` = base.`id`
LEFT JOIN `feature_flag_environment_variants` existing_variant
  ON existing_variant.`environment_config_id` = target.`id`
WHERE target.`value_type` = 'MULTIVARIATE'
  AND existing_variant.`id` IS NULL;
