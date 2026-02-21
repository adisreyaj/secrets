import type {
  FeatureFlag,
  FeatureFlagEnvironmentConfig,
  FeatureFlagEnvironmentVariant,
} from '@prisma/client';

export type FlagEvaluationResult = {
  enabled: boolean;
  variantKey?: string;
  variantValue?: string;
  reason:
    | 'flag_not_configured'
    | 'flag_disabled'
    | 'runtime_not_allowed'
    | 'boolean_value'
    | 'multivariate_default'
    | 'multivariate_missing_default';
};

export function evaluateFlag(params: {
  flag: Pick<FeatureFlag, 'id' | 'key'>;
  config: Pick<
    FeatureFlagEnvironmentConfig,
    'enabled' | 'valueType' | 'booleanValue' | 'runtime' | 'defaultVariantKey'
  >;
  variants: Array<Pick<FeatureFlagEnvironmentVariant, 'key' | 'value'>>;
  runtime: 'client' | 'server';
}): FlagEvaluationResult {
  const allowsRuntime =
    params.config.runtime === 'BOTH' ||
    (params.runtime === 'client' && params.config.runtime === 'CLIENT') ||
    (params.runtime === 'server' && params.config.runtime === 'SERVER');

  if (!allowsRuntime) {
    return { enabled: false, reason: 'runtime_not_allowed' };
  }

  if (!params.config.enabled) {
    return { enabled: false, reason: 'flag_disabled' };
  }

  if (params.config.valueType === 'BOOLEAN') {
    return {
      enabled: Boolean(params.config.booleanValue),
      reason: 'boolean_value',
    };
  }

  const defaultKey = params.config.defaultVariantKey ?? '';
  const variant = params.variants.find((candidate) => candidate.key === defaultKey);
  if (!variant) {
    return { enabled: false, reason: 'multivariate_missing_default' };
  }

  return {
    enabled: true,
    variantKey: variant.key,
    variantValue: variant.value,
    reason: 'multivariate_default',
  };
}
