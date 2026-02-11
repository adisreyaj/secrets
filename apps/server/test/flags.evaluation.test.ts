import { describe, expect, it } from 'vitest';
import { evaluateFlag } from '../src/server/services/flags/evaluation.js';

describe('evaluateFlag', () => {
  it('evaluates boolean flags from explicit environment config', () => {
    const result = evaluateFlag({
      flag: {
        id: 'flag_1',
        key: 'ui_refresh'
      },
      config: {
        enabled: true,
        valueType: 'BOOLEAN',
        booleanValue: true,
        runtime: 'BOTH',
        defaultVariantKey: null,
      },
      variants: [],
      runtime: 'server',
    });

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe('boolean_value');
  });

  it('blocks evaluation when runtime is not allowed', () => {
    const result = evaluateFlag({
      flag: {
        id: 'flag_2',
        key: 'server_only_flag',
      },
      config: {
        enabled: true,
        valueType: 'BOOLEAN',
        booleanValue: true,
        runtime: 'SERVER',
        defaultVariantKey: null,
      },
      variants: [],
      runtime: 'client',
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('runtime_not_allowed');
  });

  it('returns default multivariate variant', () => {
    const result = evaluateFlag({
      flag: {
        id: 'flag_3',
        key: 'checkout_flow',
      },
      config: {
        enabled: true,
        valueType: 'MULTIVARIATE',
        booleanValue: null,
        runtime: 'BOTH',
        defaultVariantKey: 'modern',
      },
      variants: [
        { key: 'legacy', value: 'legacy' },
        { key: 'modern', value: '{"theme":"new"}' },
      ],
      runtime: 'server',
    });

    expect(result.enabled).toBe(true);
    expect(result.variantKey).toBe('modern');
    expect(result.reason).toBe('multivariate_default');
  });
});
