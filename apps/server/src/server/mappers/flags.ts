import type {
  FeatureFlag,
  FeatureFlagRule,
  FeatureFlagValueType,
  FeatureFlagVariant,
} from '@prisma/client';

export function toFeatureFlagDto(flag: FeatureFlag) {
  return {
    id: flag.id,
    projectId: flag.projectId,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    valueType: flag.valueType as 'BOOLEAN' | 'MULTIVARIATE',
    enabled: flag.enabled,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: flag.updatedAt.toISOString(),
  };
}

export function toFeatureFlagVariantDto(variant: FeatureFlagVariant) {
  return {
    id: variant.id,
    flagId: variant.flagId,
    key: variant.key,
    value: variant.value,
    weight: variant.weight,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

export function toFeatureFlagRuleDto(rule: FeatureFlagRule) {
  return {
    id: rule.id,
    flagId: rule.flagId,
    priority: rule.priority,
    rolloutPercentage: rule.rolloutPercentage,
    variantId: rule.variantId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function isFeatureFlagValueType(
  value: string,
): value is FeatureFlagValueType {
  return value === 'BOOLEAN' || value === 'MULTIVARIATE';
}
