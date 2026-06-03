import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, environmentFindUnique, environmentUpdate } = vi.hoisted(() => {
  const state = {
    environments: new Map<string, { id: string; encryptedDek: Uint8Array | null; encryptedDekBackup: Uint8Array | null }>(),
  };
  return {
    state,
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
  };
});

vi.mock('../src/db.js', () => ({
  prisma: {
    environment: {
      findUnique: environmentFindUnique,
      update: environmentUpdate,
    },
  },
}));

import { loadMasterKey } from '../src/crypto.js';
import {
  clearEnvironmentDekCache,
  decryptSecretWithKey,
  encryptSecretWithKey,
  getOrCreateEnvironmentDek,
  provisionEnvironmentDek,
} from '../src/server/services/envCrypto.js';

beforeAll(() => {
  process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
});

beforeEach(() => {
  state.environments.clear();
  clearEnvironmentDekCache();
  environmentFindUnique.mockClear();
  environmentUpdate.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('envCrypto', () => {
  it('provisions a new DEK for an environment without one', async () => {
    state.environments.set('env_1', { id: 'env_1', encryptedDek: null, encryptedDekBackup: null });

    const dek = await provisionEnvironmentDek('env_1');

    expect(dek.length).toBe(32);
    const stored = state.environments.get('env_1')!;
    expect(stored.encryptedDek).toBeTruthy();
    expect((stored.encryptedDek as Uint8Array).length).toBeGreaterThan(0);
  });

  it('round-trips secret encryption with the same DEK', async () => {
    state.environments.set('env_1', { id: 'env_1', encryptedDek: null, encryptedDekBackup: null });
    const dek = await getOrCreateEnvironmentDek('env_1');

    const payload = encryptSecretWithKey('super-secret', dek, 'env_1', 'API_KEY');
    const value = decryptSecretWithKey(
      { ciphertext: payload.ciphertext, iv: payload.iv, tag: payload.tag },
      dek,
      'env_1',
      'API_KEY',
    );
    expect(value).toBe('super-secret');
  });

  it('refuses to decrypt with mismatched key AAD (ciphertext transplant)', async () => {
    state.environments.set('env_1', { id: 'env_1', encryptedDek: null, encryptedDekBackup: null });
    const dek = await getOrCreateEnvironmentDek('env_1');

    const payload = encryptSecretWithKey('production-db-password', dek, 'env_1', 'DB_PASSWORD');

    expect(() =>
      decryptSecretWithKey(
        { ciphertext: payload.ciphertext, iv: payload.iv, tag: payload.tag },
        dek,
        'env_1',
        'LOW_SENSITIVITY_KEY',
      ),
    ).toThrow();
  });

  it('caches the DEK after the first load', async () => {
    state.environments.set('env_1', { id: 'env_1', encryptedDek: null, encryptedDekBackup: null });
    const first = await getOrCreateEnvironmentDek('env_1');
    const second = await getOrCreateEnvironmentDek('env_1');
    expect(first).toBe(second);
    expect(environmentFindUnique).toHaveBeenCalledTimes(1);
  });

  it('decrypts a previously provisioned DEK from the stored column', async () => {
    state.environments.set('env_1', { id: 'env_1', encryptedDek: null, encryptedDekBackup: null });
    const provisioned = await provisionEnvironmentDek('env_1');
    clearEnvironmentDekCache();
    const reloaded = await getOrCreateEnvironmentDek('env_1');
    expect(reloaded.equals(provisioned)).toBe(true);
  });

  it('uses the master key (so it is independent of any particular secret)', () => {
    const masterKey = loadMasterKey();
    expect(masterKey.length).toBe(32);
  });
});
