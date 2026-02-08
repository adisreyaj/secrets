import { describe, expect, it } from 'vitest';
import { sanitizeForLogs, sanitizeHeaders } from '../src/server/logging/sanitize.js';

describe('sanitizeHeaders', () => {
  it('redacts sensitive headers', () => {
    const sanitized = sanitizeHeaders({
      authorization: 'Bearer secret',
      cookie: 'sm_session=abc',
      'x-request-id': 'req_1',
    });

    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized['x-request-id']).toBe('req_1');
  });
});

describe('sanitizeForLogs', () => {
  it('redacts nested sensitive keys', () => {
    const sanitized = sanitizeForLogs({
      password: 'pass123',
      nested: {
        token: 'abc',
        safe: 'value',
      },
      items: [{ secretValue: 'x' }],
    });

    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.nested.token).toBe('[REDACTED]');
    expect(sanitized.nested.safe).toBe('value');
    expect(sanitized.items[0].secretValue).toBe('[REDACTED]');
  });
});
