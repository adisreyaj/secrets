import crypto from 'node:crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

export interface EncryptedPayload {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  tag: Uint8Array<ArrayBuffer>;
}

type DecryptablePayload = {
  ciphertext: Buffer | Uint8Array;
  iv: Buffer | Uint8Array;
  tag: Buffer | Uint8Array;
};

export class DecryptionError extends Error {
  constructor(cause?: unknown) {
    super('Failed to decrypt payload', { cause });
    this.name = 'DecryptionError';
  }
}

function toBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(input.byteLength);
  bytes.set(input);
  return bytes;
}

export function loadMasterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) {
    throw new Error('MASTER_KEY is required');
  }

  let key: Buffer;
  const hexMatch = /^[0-9a-fA-F]+$/.test(raw);
  if (hexMatch) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error('MASTER_KEY must be 32 bytes (64 hex chars or 32-byte base64).');
  }

  return key;
}

export function masterKeyVersion(): string {
  return process.env.MASTER_KEY_VERSION ?? 'v1';
}

export function generateDek(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

export function aadForEnvironmentDek(environmentId: string): string {
  return `env:dek:${environmentId}`;
}

export function aadForSecret(
  environmentId: string,
  identifier: string | undefined,
  kind: 'id' | 'key' = 'id',
): string {
  const safe = identifier ?? '_';
  return `env:${environmentId};secret_${kind}:${safe}`;
}

export function aadForProviderConfig(providerConfigId: string): string {
  return `auth:provider:${providerConfigId}`;
}

export function aadForSigningKey(signingKeyId: string): string {
  return `auth:signing_key:${signingKeyId}`;
}

export function aadForGeneric(parts: Record<string, string>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
}

export function encryptSecret(
  plaintext: string,
  key: Buffer,
  aad: string | Buffer,
): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(typeof aad === 'string' ? Buffer.from(aad, 'utf8') : aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: toBytes(ciphertext),
    iv: toBytes(iv),
    tag: toBytes(tag),
  };
}

export function decryptSecret(
  payload: DecryptablePayload,
  key: Buffer,
  aad: string | Buffer,
): string {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.iv);
    decipher.setAAD(typeof aad === 'string' ? Buffer.from(aad, 'utf8') : aad);
    decipher.setAuthTag(payload.tag);
    const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (cause) {
    throw new DecryptionError(cause);
  }
}
