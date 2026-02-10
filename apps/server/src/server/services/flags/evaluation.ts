import { createHash } from 'node:crypto';
import type {
  FeatureFlag,
  FeatureFlagEnvironmentOverride,
  FeatureFlagRule,
  FeatureFlagVariant,
} from '@prisma/client';

export type FlagEvaluationResult = {
  enabled: boolean;
  variantKey?: string;
  variantValue?: string;
  reason:
    | 'override_disabled'
    | 'override_variant'
    | 'override_enabled'
    | 'flag_disabled'
    | 'rule_disabled'
    | 'rule_enabled'
    | 'weighted_variant'
    | 'default_boolean'
    | 'default_multivariate_disabled';
};

function stableBucket(input: string): number {
  const hash = createHash('sha256').update(input).digest('hex');
  const first32 = hash.slice(0, 8);
  return Number.parseInt(first32, 16) % 100;
}

function chooseWeightedVariant(
  variants: Array<Pick<FeatureFlagVariant, 'id' | 'key' | 'value' | 'weight'>>,
  seed: string,
) {
  const candidates = variants.filter((variant) => variant.weight > 0);
  if (!candidates.length) {
    return null;
  }

  const totalWeight = candidates.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const hash = createHash('sha256').update(seed).digest('hex');
  const first32 = hash.slice(0, 8);
  let cursor = Number.parseInt(first32, 16) % totalWeight;
  for (const candidate of candidates) {
    if (cursor < candidate.weight) {
      return candidate;
    }
    cursor -= candidate.weight;
  }

  return candidates[candidates.length - 1] ?? null;
}

export function evaluateFlag(params: {
  flag: Pick<FeatureFlag, 'id' | 'key' | 'valueType' | 'enabled'>;
  rules: Array<Pick<FeatureFlagRule, 'priority' | 'rolloutPercentage' | 'variantId'>>;
  variants: Array<Pick<FeatureFlagVariant, 'id' | 'key' | 'value' | 'weight'>>;
  override?: Pick<FeatureFlagEnvironmentOverride, 'enabled' | 'variantId'> | null;
  subjectKey: string;
}): FlagEvaluationResult {
  const variantById = new Map(params.variants.map((variant) => [variant.id, variant]));

  if (params.override) {
    if (params.override.enabled === false) {
      return { enabled: false, reason: 'override_disabled' };
    }
    if (params.override.variantId) {
      const variant = variantById.get(params.override.variantId);
      if (variant) {
        return {
          enabled: true,
          variantKey: variant.key,
          variantValue: variant.value,
          reason: 'override_variant',
        };
      }
    }
    if (params.override.enabled === true) {
      return { enabled: true, reason: 'override_enabled' };
    }
  }

  if (!params.flag.enabled) {
    return { enabled: false, reason: 'flag_disabled' };
  }

  const orderedRules = [...params.rules].sort((a, b) => a.priority - b.priority);
  const bucket = stableBucket(`${params.flag.id}:${params.subjectKey}`);

  const matchingRule = orderedRules.find(
    (rule) => bucket < Math.max(0, Math.min(100, rule.rolloutPercentage)),
  );

  if (params.flag.valueType === 'BOOLEAN') {
    if (!matchingRule) {
      return { enabled: false, reason: 'rule_disabled' };
    }
    return { enabled: true, reason: 'rule_enabled' };
  }

  if (matchingRule?.variantId) {
    const variant = variantById.get(matchingRule.variantId);
    if (variant) {
      return {
        enabled: true,
        variantKey: variant.key,
        variantValue: variant.value,
        reason: 'rule_enabled',
      };
    }
  }

  const weighted = chooseWeightedVariant(
    params.variants,
    `${params.flag.id}:${params.subjectKey}:variant`,
  );
  if (weighted) {
    return {
      enabled: true,
      variantKey: weighted.key,
      variantValue: weighted.value,
      reason: 'weighted_variant',
    };
  }

  return { enabled: false, reason: 'default_multivariate_disabled' };
}
