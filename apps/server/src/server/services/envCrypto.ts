import {
  aadForSecret,
  decryptSecret,
  encryptSecret,
  generateDek,
  loadMasterKey,
  type EncryptedPayload,
} from '../../crypto.js';
import { prisma } from '../../db.js';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

type EnvironmentLite = {
  id: string;
  encryptedDek: Uint8Array | null;
  encryptedDekBackup: Uint8Array | null;
};

const dekCache = new Map<string, Buffer>();

export function clearEnvironmentDekCache(): void {
  dekCache.clear();
}

function packDekPayload(payload: EncryptedPayload): Buffer {
  const iv = Buffer.from(payload.iv);
  const tag = Buffer.from(payload.tag);
  const ciphertext = Buffer.from(payload.ciphertext);
  if (iv.length !== IV_LENGTH) {
    throw new Error('DEK payload IV has unexpected length');
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error('DEK payload tag has unexpected length');
  }
  return Buffer.concat([iv, tag, ciphertext]);
}

function unpackDekPayload(packed: Buffer): EncryptedPayload {
  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('DEK payload is too short');
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);
  const ivBytes = new Uint8Array(IV_LENGTH);
  const tagBytes = new Uint8Array(TAG_LENGTH);
  const ciphertextBytes = new Uint8Array(ciphertext.length);
  ivBytes.set(iv);
  tagBytes.set(tag);
  ciphertextBytes.set(ciphertext);
  return {
    ciphertext: ciphertextBytes,
    iv: ivBytes,
    tag: tagBytes,
  };
}

function toBuffer(value: Uint8Array | Buffer | null | undefined): Buffer | null {
  if (!value) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

async function loadEnvironmentLite(environmentId: string): Promise<EnvironmentLite | null> {
  return prisma.environment.findUnique({
    where: { id: environmentId },
    select: { id: true, encryptedDek: true, encryptedDekBackup: true },
  });
}

export async function getOrCreateEnvironmentDek(environmentId: string): Promise<Buffer> {
  const cached = dekCache.get(environmentId);
  if (cached) {
    return cached;
  }

  const env = await loadEnvironmentLite(environmentId);
  if (!env) {
    throw new Error(`Environment ${environmentId} not found`);
  }

  const masterKey = loadMasterKey();
  const primary = toBuffer(env.encryptedDek);
  if (primary) {
    const packed = unpackDekPayload(primary);
    const wrappedDekB64 = decryptSecret(packed, masterKey, aadForSecret(environmentId, 'dek'));
    const dekBuffer = Buffer.from(wrappedDekB64, 'base64');
    if (dekBuffer.length !== 32) {
      throw new Error('Decrypted DEK has unexpected length');
    }
    dekCache.set(environmentId, dekBuffer);
    return dekBuffer;
  }

  return provisionEnvironmentDek(environmentId);
}

export async function provisionEnvironmentDek(environmentId: string): Promise<Buffer> {
  const masterKey = loadMasterKey();
  const dek = generateDek();
  const wrapped = encryptSecret(dek.toString('base64'), masterKey, aadForSecret(environmentId, 'dek'));

  const packed = packDekPayload(wrapped);
  const packedBytes = new Uint8Array(packed.length);
  packedBytes.set(packed);
  await prisma.environment.update({
    where: { id: environmentId },
    data: {
      encryptedDek: packedBytes,
    },
  });

  dekCache.set(environmentId, dek);
  return dek;
}

export function encryptSecretWithKey(
  plaintext: string,
  dek: Buffer,
  environmentId: string,
  secretKey: string,
): EncryptedPayload {
  return encryptSecret(plaintext, dek, aadForSecret(environmentId, secretKey, 'key'));
}

export function decryptSecretWithKey(
  payload: { ciphertext: Buffer | Uint8Array; iv: Buffer | Uint8Array; tag: Buffer | Uint8Array },
  dek: Buffer,
  environmentId: string,
  secretKey: string,
): string {
  return decryptSecret(payload, dek, aadForSecret(environmentId, secretKey, 'key'));
}

export async function withEnvironmentDek<T>(
  environmentId: string,
  fn: (dek: Buffer) => Promise<T> | T,
): Promise<T> {
  const dek = await getOrCreateEnvironmentDek(environmentId);
  return fn(dek);
}
