import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, secretVersions } from '../../db/index.js';

/** Columns safe for Drizzle relational JSON nesting (excludes DEK blobs). */
export const SECRET_ENVIRONMENT_COLUMNS = {
  id: true,
  projectId: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SecretVersion = typeof secretVersions.$inferSelect;

/**
 * Load the newest active version per secret via a direct table query.
 * Relational `with: { versions }` cannot include ciphertext/iv/tag blobs —
 * SQLite JSON aggregation rejects BLOB values.
 */
export async function getActiveVersionsBySecretId(
  secretIds: string[],
): Promise<Map<string, SecretVersion>> {
  const bySecretId = new Map<string, SecretVersion>();
  if (secretIds.length === 0) {
    return bySecretId;
  }

  const rows = await db.query.secretVersions.findMany({
    where: and(inArray(secretVersions.secretId, secretIds), eq(secretVersions.isActive, true)),
    orderBy: [desc(secretVersions.createdAt)],
  });

  for (const row of rows) {
    if (!bySecretId.has(row.secretId)) {
      bySecretId.set(row.secretId, row);
    }
  }

  return bySecretId;
}

/** All versions for the given secrets, oldest first, grouped by secretId. */
export async function getVersionsBySecretId(
  secretIds: string[],
): Promise<Map<string, SecretVersion[]>> {
  const bySecretId = new Map<string, SecretVersion[]>();
  if (secretIds.length === 0) {
    return bySecretId;
  }

  const rows = await db.query.secretVersions.findMany({
    where: inArray(secretVersions.secretId, secretIds),
    orderBy: [asc(secretVersions.createdAt)],
  });

  for (const row of rows) {
    const list = bySecretId.get(row.secretId);
    if (list) {
      list.push(row);
    } else {
      bySecretId.set(row.secretId, [row]);
    }
  }

  return bySecretId;
}
