-- Remove multivariate flags/config and switch to BOOLEAN + JSON value types.

-- Hard-delete multivariate flags (dev-stage cleanup requirement).
DELETE FROM `feature_flags`
WHERE `value_type` = 'MULTIVARIATE';

-- Add JSON value storage to per-environment flag configuration.
ALTER TABLE `feature_flag_environment_configs`
  ADD COLUMN `json_value` JSON NULL AFTER `boolean_value`;

-- Remove now-obsolete multivariate default key from env configs.
ALTER TABLE `feature_flag_environment_configs`
  DROP COLUMN `default_variant_key`;

-- Drop obsolete multivariate tables.
DROP TABLE IF EXISTS `feature_flag_environment_variants`;
DROP TABLE IF EXISTS `feature_flag_env_overrides`;
DROP TABLE IF EXISTS `feature_flag_rules`;
DROP TABLE IF EXISTS `feature_flag_variants`;

-- Restrict value type enums to BOOLEAN + JSON.
ALTER TABLE `feature_flags`
  MODIFY COLUMN `value_type` ENUM('BOOLEAN', 'JSON') NOT NULL;

ALTER TABLE `feature_flag_environment_configs`
  MODIFY COLUMN `value_type` ENUM('BOOLEAN', 'JSON') NOT NULL;
