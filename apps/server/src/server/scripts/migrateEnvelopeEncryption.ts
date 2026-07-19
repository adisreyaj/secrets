import { and, eq, isNull } from 'drizzle-orm';
import { db, secrets, secretVersions } from '../../db/index.js';
import { decryptSecret, loadMasterKey } from '../../crypto.js';
import {
  encryptSecretWithKey,
  getOrCreateEnvironmentDek,
} from '../services/envCrypto.js';

type MigrationResult = {
  environmentsProcessed: number;
  environmentsSkipped: number;
  secretsReEncrypted: number;
  versionsReEncrypted: number;
  errors: { environmentId: string; secretId?: string; message: string }[];
};

const LEGACY_AAD_PLACEHOLDER = Buffer.alloc(0);

export async function migrateLegacySecretsToEnvelope(): Promise<MigrationResult> {
  const result: MigrationResult = {
    environmentsProcessed: 0,
    environmentsSkipped: 0,
    secretsReEncrypted: 0,
    versionsReEncrypted: 0,
    errors: [],
  };

  const masterKey = loadMasterKey();
  const environmentRows = await db.query.environments.findMany({
    columns: { id: true, name: true, encryptedDek: true, projectId: true },
  });

  for (const env of environmentRows) {
    try {
      const dek = await getOrCreateEnvironmentDek(env.id);
      const secretRows = await db.query.secrets.findMany({
        where: and(eq(secrets.environmentId, env.id), isNull(secrets.deletedAt)),
        with: {
          versions: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] },
        },
      });

      let touchedSecretIds: string[] = [];
      for (const secret of secretRows) {
        try {
          let anyVersionReEncrypted = false;
          for (const version of secret.versions) {
            try {
              const plaintext = decryptLegacy(version, masterKey);
              const rewritten = encryptSecretWithKey(plaintext, dek, env.id, secret.key);
              if (!buffersEqual(rewritten.ciphertext, version.ciphertext)) {
                await db
                  .update(secretVersions)
                  .set({
                    ciphertext: Buffer.from(rewritten.ciphertext),
                    iv: Buffer.from(rewritten.iv),
                    tag: Buffer.from(rewritten.tag),
                  })
                  .where(eq(secretVersions.id, version.id));
                result.versionsReEncrypted += 1;
                anyVersionReEncrypted = true;
              }
            } catch (cause) {
              if (isLegacyAadFailure(cause)) {
                result.errors.push({
                  environmentId: env.id,
                  secretId: secret.id,
                  message: 'Legacy payload was not encrypted with empty AAD - skipping version',
                });
              } else {
                throw cause;
              }
            }
          }
          if (anyVersionReEncrypted) {
            touchedSecretIds.push(secret.id);
            result.secretsReEncrypted += 1;
          }
        } catch (cause) {
          result.errors.push({
            environmentId: env.id,
            secretId: secret.id,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      result.environmentsProcessed += 1;
      void touchedSecretIds;
    } catch (cause) {
      result.errors.push({
        environmentId: env.id,
        message: cause instanceof Error ? cause.message : String(cause),
      });
      result.environmentsSkipped += 1;
    }
  }

  return result;
}

function decryptLegacy(
  version: { ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array },
  masterKey: Buffer,
): string {
  return decryptSecret(
    { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
    masterKey,
    LEGACY_AAD_PLACEHOLDER,
  );
}

function isLegacyAadFailure(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const message = cause.message ?? '';
  return (
    message.includes('Unsupported state') ||
    message.includes('auth tag') ||
    message.toLowerCase().includes('aad')
  );
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateLegacySecretsToEnvelope()
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
