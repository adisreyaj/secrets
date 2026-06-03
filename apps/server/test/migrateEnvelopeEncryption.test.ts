import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, environmentFindMany, environmentFindUnique, environmentUpdate, secretFindMany, secretVersionUpdate } = vi.hoisted(() => {
  const state = {
    environments: new Map<string, { id: string; name: string; projectId: string; encryptedDek: Uint8Array | null; encryptedDekBackup: Uint8Array | null }>(),
    secrets: new Map<string, { id: string; environmentId: string; key: string }>(),
    versions: new Map<string, { id: string; secretId: string; ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array; keyVersion: string; isActive: boolean }>(),
  };
  return {
    state,
    environmentFindMany: vi.fn(async () => Array.from(state.environments.values())),
    environmentFindUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      state.environments.get(where.id) ?? null,
    ),
    environmentUpdate: vi.fn(async ({ where, data }: { where: { id: string }; data: { encryptedDek?: Uint8Array | null } }) => {
      const current = state.environments.get(where.id);
      if (!current) throw new Error('env not found');
      if (data.encryptedDek !== undefined) {
        current.encryptedDek = data.encryptedDek;
      }
      return current;
    }),
    secretFindMany: vi.fn(async ({ where }: { where: { environmentId: string } }) =>
      Array.from(state.secrets.values()).filter((s) => s.environmentId === where.environmentId),
    ),
    secretVersionUpdate: vi.fn(async ({ where, data }: { where: { id: string }; data: { ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array } }) => {
      const current = state.versions.get(where.id);
      if (!current) throw new Error('version not found');
      current.ciphertext = data.ciphertext;
      current.iv = data.iv;
      current.tag = data.tag;
      return current;
    }),
  };
});

vi.mock('../src/db.js', () => ({
  prisma: {
    environment: {
      findMany: environmentFindMany,
      findUnique: environmentFindUnique,
      update: environmentUpdate,
    },
    secret: {
      findMany: secretFindMany,
    },
    secretVersion: {
      update: secretVersionUpdate,
    },
  },
}));

import { decryptSecret, loadMasterKey } from '../../src/crypto.js';
import {
  clearEnvironmentDekCache,
  getOrCreateEnvironmentDek,
} from '../../src/server/services/envCrypto.js';
import { migrateLegacySecretsToEnvelope } from '../../src/server/scripts/migrateEnvelopeEncryption.js';
import crypto from 'node:crypto';

beforeAll(() => {
  process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
});

beforeEach(() => {
  state.environments.clear();
  state.secrets.clear();
  state.versions.clear();
  clearEnvironmentDekCache();
  environmentFindMany.mockClear();
  environmentFindUnique.mockClear();
  environmentUpdate.mockClear();
  secretFindMany.mockClear();
  secretVersionUpdate.mockClear();
  secretFindMany.mockImplementation(async ({ where }: { where: { environmentId: string } }) => {
    const secrets = Array.from(state.secrets.values()).filter(
      (s) => s.environmentId === where.environmentId,
    );
    return secrets.map((secret) => ({
      ...secret,
      versions: Array.from(state.versions.values()).filter((v) => v.secretId === secret.id),
    }));
  });
});

function legacyEncrypt(plaintext: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

describe('migrateLegacySecretsToEnvelope', () => {
  it('re-encrypts legacy secrets with the new DEK + AAD scheme', async () => {
    const masterKey = loadMasterKey();

    state.environments.set('env_1', {
      id: 'env_1',
      name: 'production',
      projectId: 'project_1',
      encryptedDek: null,
      encryptedDekBackup: null,
    });

    const legacy = legacyEncrypt('legacy-secret-value', masterKey);
    state.secrets.set('s_1', { id: 's_1', environmentId: 'env_1', key: 'API_KEY' });
    state.versions.set('v_1', {
      id: 'v_1',
      secretId: 's_1',
      ciphertext: legacy.ciphertext,
      iv: legacy.iv,
      tag: legacy.tag,
      keyVersion: 'v1',
      isActive: true,
    });

    const result = await migrateLegacySecretsToEnvelope();

    expect(result.environmentsProcessed).toBe(1);
    expect(result.versionsReEncrypted).toBe(1);
    expect(result.secretsReEncrypted).toBe(1);
    expect(result.errors).toEqual([]);

    const updated = state.versions.get('v_1')!;
    expect(Buffer.compare(updated.ciphertext, legacy.ciphertext)).not.toBe(0);

    const dek = await getOrCreateEnvironmentDek('env_1');
    const decrypted = decryptSecret(
      { ciphertext: updated.ciphertext, iv: updated.iv, tag: updated.tag },
      dek,
      `env:env_1;secret_key:API_KEY`,
    );
    expect(decrypted).toBe('legacy-secret-value');
  });

  it('skips orphan data when an environment has no secrets', async () => {
    state.environments.set('env_1', {
      id: 'env_1',
      name: 'production',
      projectId: 'project_1',
      encryptedDek: null,
      encryptedDekBackup: null,
    });

    const result = await migrateLegacySecretsToEnvelope();
    expect(result.environmentsProcessed).toBe(1);
    expect(result.versionsReEncrypted).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
