import crypto from 'crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
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

export function encryptSecret(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { ciphertext, iv, tag };
}

export function decryptSecret(payload: EncryptedPayload, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.iv);
  decipher.setAuthTag(payload.tag);
  const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export function masterKeyVersion(): string {
  return process.env.MASTER_KEY_VERSION ?? 'v1';
}
