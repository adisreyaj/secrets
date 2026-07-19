/** libSQL / SQLite unique constraint failures (replaces Prisma P2002). */
export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message =
    'message' in error ? String((error as { message?: unknown }).message) : '';

  return (
    code === 'SQLITE_CONSTRAINT' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'CONSTRAINT' ||
    message.includes('UNIQUE constraint failed') ||
    message.includes('unique constraint')
  );
}
