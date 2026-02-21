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
        jsonValue: null,
        runtime: 'BOTH',
      },
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
        jsonValue: null,
        runtime: 'SERVER',
      },
      runtime: 'client',
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('runtime_not_allowed');
  });

  it('returns json value for JSON flags', () => {
    const result = evaluateFlag({
      flag: {
        id: 'flag_3',
        key: 'checkout_flow',
      },
      config: {
        enabled: true,
        valueType: 'JSON',
        booleanValue: null,
        jsonValue: { theme: 'new' },
        runtime: 'BOTH',
      },
      runtime: 'server',
    });

    expect(result.enabled).toBe(true);
    expect(result.jsonValue).toEqual({ theme: 'new' });
    expect(result.reason).toBe('json_value');
  });
});
