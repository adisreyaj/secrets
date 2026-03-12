import type {
  FeatureFlag,
  FeatureFlagEnvironmentConfig,
  FeatureFlagRuntime,
  FeatureFlagValueType,
} from '@prisma/client';

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
  environmentConfig: FeatureFlagEnvironmentConfig,
) {
  return {
    id: flag.id,
    projectId: flag.projectId,
    environmentId: environmentConfig.environmentId,
    key: flag.key,
    description: flag.description,
    valueType: environmentConfig.valueType as 'BOOLEAN' | 'JSON',
    exposed: environmentConfig.enabled,
    enabled: environmentConfig.enabled,
    runtime: toRuntimeDto(environmentConfig.runtime),
    labels: toLabels(environmentConfig.labelsJson),
    booleanValue: environmentConfig.booleanValue,
    jsonValue: environmentConfig.jsonValue ?? null,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: environmentConfig.updatedAt.toISOString(),
  };
}

export function isFeatureFlagValueType(
  value: string,
): value is FeatureFlagValueType {
  return value === 'BOOLEAN' || value === 'JSON';
}
