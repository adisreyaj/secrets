import { describe, expect, it } from 'vitest';
import { shouldLogStatus } from '../src/server/logging/policy.js';

describe('shouldLogStatus', () => {
  it('logs all 5xx statuses', () => {
    expect(shouldLogStatus(500)).toBe(true);
    expect(shouldLogStatus(503)).toBe(true);
  });

  it('logs selected 4xx statuses', () => {
    expect(shouldLogStatus(401)).toBe(true);
    expect(shouldLogStatus(403)).toBe(true);
    expect(shouldLogStatus(409)).toBe(true);
    expect(shouldLogStatus(429)).toBe(true);
  });

  it('does not log low-signal statuses by default', () => {
    expect(shouldLogStatus(400)).toBe(false);
    expect(shouldLogStatus(404)).toBe(false);
  });
});
