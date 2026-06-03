import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  aadForSecret,
  decryptSecret,
  DecryptionError,
  encryptSecret,
} from '../src/crypto.js';

const key = crypto.randomBytes(32);

describe('crypto helpers', () => {
  it('encrypts and decrypts secrets with matching AAD', () => {
    const payload = encryptSecret('hello-world', key, 'env:env_1;secret_key:API_KEY');
    const value = decryptSecret(payload, key, 'env:env_1;secret_key:API_KEY');
    expect(value).toBe('hello-world');
  });

  it('throws DecryptionError when AAD does not match on decrypt', () => {
    const payload = encryptSecret('hello-world', key, 'env:env_1;secret_key:API_KEY');
    expect(() =>
      decryptSecret(payload, key, 'env:env_2;secret_key:API_KEY'),
    ).toThrow(DecryptionError);
  });

  it('throws DecryptionError when AAD does not match on encrypt side', () => {
    const payload = encryptSecret('hello-world', key, 'env:env_1;secret_key:API_KEY');
    expect(() =>
      decryptSecret(payload, key, 'env:env_1;secret_key:DIFFERENT_KEY'),
    ).toThrow(DecryptionError);
  });

  it('throws DecryptionError on tampered ciphertext', () => {
    const payload = encryptSecret('hello-world', key, 'env:env_1');
    const tampered = {
      ...payload,
      ciphertext: new Uint8Array(payload.ciphertext),
    };
    tampered.ciphertext[0] ^= 0xff;
    expect(() => decryptSecret(tampered, key, 'env:env_1')).toThrow(DecryptionError);
  });

  it('throws DecryptionError on invalid auth tag', () => {
    const payload = encryptSecret('hello-world', key, 'env:env_1');
    const bad = { ...payload, tag: crypto.randomBytes(payload.tag.length) };
    expect(() => decryptSecret(bad, key, 'env:env_1')).toThrow(DecryptionError);
  });

  it('generates deterministic-looking AAD identifiers', () => {
    expect(aadForSecret('env_1', 'API_KEY', 'key')).toBe('env:env_1;secret_key:API_KEY');
    expect(aadForSecret('env_1', 'secret_id_1', 'id')).toBe('env:env_1;secret_id:secret_id_1');
  });
});
