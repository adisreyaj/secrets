import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, environmentsFindMany, secretsFindMany, secretVersionsFindMany, versionsUpdate } =
  vi.hoisted(() => {
    const state = {
      environments: new Map<
        string,
        {
          id: string;
          name: string;
          projectId: string;
          encryptedDek: Buffer | null;
          encryptedDekBackup: Buffer | null;
        }
      >(),
      secrets: new Map<
        string,
        {
          id: string;
          environmentId: string;
          key: string;
          versions: Array<{
            id: string;
            secretId: string;
            ciphertext: Buffer;
            iv: Buffer;
            tag: Buffer;
            keyVersion: string;
            isActive: boolean;
            createdAt: Date;
          }>;
        }
      >(),
    };
    return {
      state,
      environmentsFindMany: vi.fn(async () => Array.from(state.environments.values())),
      secretsFindMany: vi.fn(async () => []),
      secretVersionsFindMany: vi.fn(async () => []),
      versionsUpdate: vi.fn(),
    };
  });

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(async () => {
      const setCall = updateChain.set.mock.calls.at(-1)?.[0] as
        | { ciphertext?: Buffer; iv?: Buffer; tag?: Buffer; encryptedDek?: Buffer }
        | undefined;
      if (setCall?.encryptedDek) {
        const env = [...state.environments.values()][0];
        if (env) env.encryptedDek = setCall.encryptedDek;
      }
      if (setCall?.ciphertext) {
        for (const secret of state.secrets.values()) {
          for (const version of secret.versions) {
            version.ciphertext = setCall.ciphertext!;
            version.iv = setCall.iv!;
            version.tag = setCall.tag!;
          }
        }
      }
      versionsUpdate(setCall);
      return undefined;
    }),
  };
  return {
    ...actual,
    db: {
      query: {
        environments: {
          findMany: environmentsFindMany,
          findFirst: async () => [...state.environments.values()][0] ?? null,
        },
        secrets: { findMany: secretsFindMany },
        secretVersions: { findMany: secretVersionsFindMany },
      },
      update: vi.fn(() => updateChain),
    },
  };
});

import { encryptSecret, loadMasterKey } from '../src/crypto.js';
import { clearEnvironmentDekCache } from '../src/server/services/envCrypto.js';
import { migrateLegacySecretsToEnvelope } from '../src/server/scripts/migrateEnvelopeEncryption.js';

beforeAll(() => {
  process.env.MASTER_KEY = Buffer.alloc(32).toString('hex');
});

beforeEach(() => {
  state.environments.clear();
  state.secrets.clear();
  clearEnvironmentDekCache();
  environmentsFindMany.mockClear();
  secretsFindMany.mockClear();
  secretVersionsFindMany.mockClear();
  versionsUpdate.mockClear();
  secretsFindMany.mockImplementation(async () => {
    const env = [...state.environments.values()][0];
    if (!env) return [];
    return Array.from(state.secrets.values())
      .filter((s) => s.environmentId === env.id)
      .map(({ versions: _versions, ...secret }) => secret);
  });
  secretVersionsFindMany.mockImplementation(async () => {
    return Array.from(state.secrets.values())
      .flatMap((secret) => secret.versions)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  });
});

describe('migrateLegacySecretsToEnvelope', () => {
  it('re-encrypts legacy secrets with the new DEK + AAD scheme', async () => {
    const masterKey = loadMasterKey();
    const legacy = encryptSecret('legacy-value', masterKey, Buffer.alloc(0));
    state.environments.set('env_1', {
      id: 'env_1',
      name: 'dev',
      projectId: 'project_1',
      encryptedDek: null,
      encryptedDekBackup: null,
    });
    state.secrets.set('secret_1', {
      id: 'secret_1',
      environmentId: 'env_1',
      key: 'API_KEY',
      versions: [
        {
          id: 'ver_1',
          secretId: 'secret_1',
          ciphertext: Buffer.from(legacy.ciphertext),
          iv: Buffer.from(legacy.iv),
          tag: Buffer.from(legacy.tag),
          keyVersion: 'v1',
          isActive: true,
          createdAt: new Date(),
        },
      ],
    });

    const result = await migrateLegacySecretsToEnvelope();

    expect(result.environmentsProcessed).toBe(1);
    expect(result.versionsReEncrypted).toBe(1);
    expect(result.secretsReEncrypted).toBe(1);
    expect(versionsUpdate).toHaveBeenCalled();
  });

  it('skips orphan data when an environment has no secrets', async () => {
    state.environments.set('env_1', {
      id: 'env_1',
      name: 'dev',
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
