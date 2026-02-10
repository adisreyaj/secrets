import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { evaluateFlag } from '../src/server/services/flags/evaluation.js';

describe('flags runtime performance', () => {
  it('keeps p95 evaluation latency under target for in-process engine', () => {
    const samples: number[] = [];
    for (let index = 0; index < 2000; index += 1) {
      const startedAt = performance.now();
      evaluateFlag({
        flag: {
          id: 'flag_perf',
          key: 'checkout_redesign',
          valueType: 'MULTIVARIATE',
          enabled: true,
        },
        rules: [
          { priority: 0, rolloutPercentage: 100, variantId: 'v2' },
          { priority: 1, rolloutPercentage: 50, variantId: 'v1' },
        ],
        variants: [
          { id: 'v1', key: 'control', value: 'A', weight: 20 },
          { id: 'v2', key: 'treatment', value: 'B', weight: 80 },
        ],
        override: null,
        subjectKey: `user_${index}`,
      });
      samples.push(performance.now() - startedAt);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    expect(p95).toBeLessThan(120);
  });
});
