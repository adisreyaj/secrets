import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, environmentsFindFirst, environmentsUpdate } = vi.hoisted(() => {
  const state = {
    environments: new Map<
      string,
      { id: string; encryptedDek: Buffer | null; encryptedDekBackup: Buffer | null }
    >(),
  };
  return {
    state,
    environmentsFindFirst: vi.fn(async (_args?: { where?: unknown }) => {
      // drizzle where is opaque; tests set up a single env
      const id = [...state.environments.keys()][0];
      return (id ? state.environments.get(id) : null) ?? null;
    }),
    environmentsUpdate: vi.fn(),
  };
});

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(async () => {
      const id = [...state.environments.keys()][0];
      const current = id ? state.environments.get(id) : null;
      if (!current) throw new Error('env not found');
      const setCall = updateChain.set.mock.calls.at(-1)?.[0] as
        | { encryptedDek?: Buffer | null }
        | undefined;
      if (setCall?.encryptedDek !== undefined) {
        current.encryptedDek = setCall.encryptedDek;
      }
      return current;
    }),
  };
  environmentsUpdate.mockImplementation(() => updateChain);
  return {
    ...actual,
    db: {
      query: {
        environments: { findFirst: environmentsFindFirst },
      },
      update: environmentsUpdate,
    },
  };
});

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
  environmentsFindFirst.mockClear();
  environmentsUpdate.mockClear();
  environmentsFindFirst.mockImplementation(async () => {
    const id = [...state.environments.keys()][0];
    return (id ? state.environments.get(id) : null) ?? null;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('envCrypto', () => {
  it('provisions a new DEK for an environment without one', async () => {
    state.environments.set('env_1', {
      id: 'env_1',
      encryptedDek: null,
      encryptedDekBackup: null,
    });

    const dek = await provisionEnvironmentDek('env_1');

    expect(dek.length).toBe(32);
    const stored = state.environments.get('env_1')!;
    expect(stored.encryptedDek).toBeTruthy();
    expect((stored.encryptedDek as Buffer).length).toBeGreaterThan(0);
  });

  it('round-trips secret encryption with the same DEK', async () => {
    state.environments.set('env_1', {
      id: 'env_1',
      encryptedDek: null,
      encryptedDekBackup: null,
    });
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

  it('loads an existing DEK from storage', async () => {
    state.environments.set('env_1', {
      id: 'env_1',
      encryptedDek: null,
      encryptedDekBackup: null,
    });
    const first = await provisionEnvironmentDek('env_1');
    clearEnvironmentDekCache();
    const second = await getOrCreateEnvironmentDek('env_1');
    expect(second.equals(first)).toBe(true);
  });
});
