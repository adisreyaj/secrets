import type { CursorPage } from '@secrets/shared'

export type { CursorPage }

/** Normalize query/API list data (plain array or cursor page). */
export const asArray = <T>(
  value: T[] | CursorPage<T> | undefined | null,
): T[] => {
  if (Array.isArray(value)) return value
  if (value && Array.isArray(value.data)) return value.data
  return []
}

export const unwrapCursorPage = asArray
