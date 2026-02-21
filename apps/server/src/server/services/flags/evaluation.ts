import type {
  FeatureFlag,
  FeatureFlagEnvironmentConfig,
} from '@prisma/client';

export type FlagEvaluationResult = {
  enabled: boolean;
  jsonValue?: unknown;
  reason:
    | 'flag_not_configured'
    | 'flag_disabled'
    | 'runtime_not_allowed'
    | 'boolean_value'
    | 'json_value';
};

export function evaluateFlag(params: {
  flag: Pick<FeatureFlag, 'id' | 'key'>;
  config: Pick<
    FeatureFlagEnvironmentConfig,
    'enabled' | 'valueType' | 'booleanValue' | 'jsonValue' | 'runtime'
  >;
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

  return {
    enabled: true,
    jsonValue: params.config.jsonValue ?? null,
    reason: 'json_value',
  };
}
