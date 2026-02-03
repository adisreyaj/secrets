import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { decryptSecret, encryptSecret } from '../src/crypto.js';

const key = crypto.randomBytes(32);

describe('crypto helpers', () => {
  it('encrypts and decrypts secrets', () => {
    const payload = encryptSecret('hello-world', key);
    const value = decryptSecret(payload, key);
    expect(value).toBe('hello-world');
  });

  it('throws on invalid auth tag', () => {
    const payload = encryptSecret('hello-world', key);
    const bad = { ...payload, tag: crypto.randomBytes(payload.tag.length) };
    expect(() => decryptSecret(bad, key)).toThrow();
  });
});
