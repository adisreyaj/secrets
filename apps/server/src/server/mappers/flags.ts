import type {
  FeatureFlag,
  FeatureFlagEnvironmentConfig,
  FeatureFlagEnvironmentVariant,
  FeatureFlagRuntime,
  FeatureFlagValueType,
} from '@prisma/client';

type ConfigWithVariants = FeatureFlagEnvironmentConfig & {
  variants: FeatureFlagEnvironmentVariant[];
};

function toRuntimeDto(runtime: FeatureFlagRuntime): 'both' | 'client' | 'server' {
  return runtime.toLowerCase() as 'both' | 'client' | 'server';
}

function toLabels(labelsJson: unknown): string[] {
  if (!Array.isArray(labelsJson)) {
    return [];
  }
  return labelsJson.filter((item): item is string => typeof item === 'string');
}

export function toFeatureFlagDto(
  flag: FeatureFlag,
  environmentConfig: ConfigWithVariants,
) {
  const variants = environmentConfig.variants
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((variant) => ({
      key: variant.key,
      valueType: variant.valueType === 'JSON' ? 'json' : 'string',
      value: variant.value,
    }));

  return {
    id: flag.id,
    projectId: flag.projectId,
    environmentId: environmentConfig.environmentId,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    valueType: environmentConfig.valueType as 'BOOLEAN' | 'MULTIVARIATE',
    enabled: environmentConfig.enabled,
    runtime: toRuntimeDto(environmentConfig.runtime),
    labels: toLabels(environmentConfig.labelsJson),
    booleanValue: environmentConfig.booleanValue,
    multivariate:
      environmentConfig.valueType === 'MULTIVARIATE'
        ? {
            defaultVariantKey: environmentConfig.defaultVariantKey ?? '',
            variants,
          }
        : null,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: environmentConfig.updatedAt.toISOString(),
  };
}

export function isFeatureFlagValueType(
  value: string,
): value is FeatureFlagValueType {
  return value === 'BOOLEAN' || value === 'MULTIVARIATE';
}
