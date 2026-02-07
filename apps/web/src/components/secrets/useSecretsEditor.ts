import type { SecretDto } from '@secrets/shared'
import { useCallback, useMemo, useState } from 'react'

type EditingRow = {
  key: string
  value: string
  dirtyKey: boolean
  dirtyValue: boolean
}

export const useSecretsEditor = ({
  secrets,
  includeValues,
  onUpdateMany,
}: {
  secrets: SecretDto[]
  includeValues: boolean
  onUpdateMany: (
    changes: { id: string; key?: string; value?: string }[],
  ) => Promise<void>
}) => {
  const [editingRows, setEditingRows] = useState<Record<string, EditingRow>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [savingChanges, setSavingChanges] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)

  const secretById = useMemo(
    () => new Map(secrets.map((secret) => [secret.id, secret])),
    [secrets],
  )

  const startEditingRow = useCallback(
    (secret: SecretDto) => {
      setEditingRows((prev) => {
        if (prev[secret.id]) {
          return prev
        }
        return {
          ...prev,
          [secret.id]: {
            key: secret.key,
            value: includeValues ? (secret.value ?? '') : '',
            dirtyKey: false,
            dirtyValue: false,
          },
        }
      })
      setRowErrors((prev) => {
        if (!prev[secret.id]) return prev
        const next = { ...prev }
        delete next[secret.id]
        return next
      })
      setTopError(null)
    },
    [includeValues],
  )

  const cancelEditingRow = useCallback((secretId: string) => {
    setEditingRows((prev) => {
      if (!prev[secretId]) return prev
      const next = { ...prev }
      delete next[secretId]
      return next
    })
    setRowErrors((prev) => {
      if (!prev[secretId]) return prev
      const next = { ...prev }
      delete next[secretId]
      return next
    })
    setTopError(null)
  }, [])

  const handleRowKeyChange = useCallback(
    (secretId: string, value: string) => {
      const original = secretById.get(secretId)?.key ?? ''
      setEditingRows((prev) => {
        const current = prev[secretId]
        if (!current) return prev
        const dirtyKey = value.trim() !== original
        return {
          ...prev,
          [secretId]: { ...current, key: value, dirtyKey },
        }
      })
      setRowErrors((prev) => {
        if (!prev[secretId]) return prev
        const next = { ...prev }
        delete next[secretId]
        return next
      })
      setTopError(null)
    },
    [secretById],
  )

  const handleRowValueChange = useCallback(
    (secretId: string, value: string) => {
      const original = secretById.get(secretId)?.value ?? ''
      const trimmed = value.trim()
      const dirtyValue = trimmed.length > 0 && trimmed !== original
      setEditingRows((prev) => {
        const current = prev[secretId]
        if (!current) return prev
        return {
          ...prev,
          [secretId]: { ...current, value, dirtyValue },
        }
      })
      setRowErrors((prev) => {
        if (!prev[secretId]) return prev
        const next = { ...prev }
        delete next[secretId]
        return next
      })
      setTopError(null)
    },
    [secretById],
  )

  const pendingChanges = useMemo(
    () =>
      Object.entries(editingRows).filter(
        ([, row]) => row.dirtyKey || row.dirtyValue,
      ),
    [editingRows],
  )

  const pendingChangesCount = pendingChanges.length

  const discardChanges = () => {
    setEditingRows({})
    setRowErrors({})
    setTopError(null)
  }

  const saveChanges = async () => {
    if (savingChanges || pendingChangesCount === 0) return
    const nextErrors: Record<string, string> = {}
    const keyToIds = new Map<string, string[]>()
    for (const secret of secrets) {
      const edit = editingRows[secret.id]
      const nextKey = edit ? edit.key.trim() : secret.key
      if (edit?.dirtyKey && !nextKey) {
        nextErrors[secret.id] = 'Key is required.'
      }
      if (nextKey) {
        const list = keyToIds.get(nextKey) ?? []
        list.push(secret.id)
        keyToIds.set(nextKey, list)
      }
    }

    for (const [key, ids] of keyToIds.entries()) {
      if (ids.length < 2) continue
      for (const id of ids) {
        if (editingRows[id]) {
          nextErrors[id] = `Key "${key}" is already used.`
        }
      }
    }

    for (const [id, row] of Object.entries(editingRows)) {
      if (row.dirtyValue && !row.value.trim()) {
        nextErrors[id] = 'Value is required.'
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setRowErrors(nextErrors)
      setTopError('Fix the highlighted fields before saving.')
      return
    }

    const changes = pendingChanges
      .map(([id, row]) => {
        const payload: { id: string; key?: string; value?: string } = { id }
        if (row.dirtyKey) {
          payload.key = row.key.trim()
        }
        if (row.dirtyValue) {
          payload.value = row.value.trim()
        }
        return payload
      })
      .filter(
        (change) => change.key !== undefined || change.value !== undefined,
      )

    if (changes.length === 0) return
    setSavingChanges(true)
    setTopError(null)
    try {
      await onUpdateMany(changes)
      discardChanges()
    } catch (error) {
      setTopError(
        error instanceof Error ? error.message : 'Failed to save changes.',
      )
    } finally {
      setSavingChanges(false)
    }
  }

  return {
    editingRows,
    rowErrors,
    savingChanges,
    topError,
    pendingChangesCount,
    startEditingRow,
    cancelEditingRow,
    handleRowKeyChange,
    handleRowValueChange,
    discardChanges,
    saveChanges,
  }
}
