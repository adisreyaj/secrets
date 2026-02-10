import { describe, expect, it } from 'vitest';
import { evaluateFlag } from '../src/server/services/flags/evaluation.js';

describe('evaluateFlag', () => {
  it('produces deterministic boolean evaluations for the same subject', () => {
    const params = {
      flag: {
        id: 'flag_1',
        key: 'new_checkout',
        valueType: 'BOOLEAN' as const,
        enabled: true,
      },
      rules: [{ priority: 0, rolloutPercentage: 50, variantId: null }],
      variants: [],
      subjectKey: 'user_123',
      override: null,
    };

    const first = evaluateFlag(params);
    const second = evaluateFlag(params);

    expect(first).toEqual(second);
  });

  it('honors explicit overrides before rule evaluation', () => {
    const result = evaluateFlag({
      flag: {
        id: 'flag_2',
        key: 'ui_refresh',
        valueType: 'BOOLEAN',
        enabled: true,
      },
      rules: [{ priority: 0, rolloutPercentage: 0, variantId: null }],
      variants: [],
      subjectKey: 'user_777',
      override: { enabled: true, variantId: null },
    });

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe('override_enabled');
  });

  it('selects multivariate variants deterministically via weights', () => {
    const params = {
      flag: {
        id: 'flag_3',
        key: 'landing_variant',
        valueType: 'MULTIVARIATE' as const,
        enabled: true,
      },
      rules: [],
      variants: [
        { id: 'v1', key: 'control', value: 'A', weight: 20 },
        { id: 'v2', key: 'treatment', value: 'B', weight: 80 },
      ],
      subjectKey: 'user_888',
      override: null,
    };

    const first = evaluateFlag(params);
    const second = evaluateFlag(params);

    expect(first).toEqual(second);
    expect(first.enabled).toBe(true);
    expect(['control', 'treatment']).toContain(first.variantKey);
  });

  it('uses override variant when present', () => {
    const result = evaluateFlag({
      flag: {
        id: 'flag_4',
        key: 'checkout_flow',
        valueType: 'MULTIVARIATE',
        enabled: true,
      },
      rules: [],
      variants: [
        { id: 'v1', key: 'legacy', value: 'legacy', weight: 50 },
        { id: 'v2', key: 'modern', value: 'modern', weight: 50 },
      ],
      subjectKey: 'user_999',
      override: { enabled: null, variantId: 'v2' },
    });

    expect(result.enabled).toBe(true);
    expect(result.variantKey).toBe('modern');
    expect(result.reason).toBe('override_variant');
  });
});
