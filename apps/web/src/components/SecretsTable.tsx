import type {
  ApprovalRequestDto,
  EnvironmentDto,
  SecretDiffResponse,
  SecretDto,
  SecretVersionDto,
} from '@secrets/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ErrorBanner } from './ErrorBanner'
import { MissingKeysSection } from './secrets/MissingKeysSection'
import { SecretActionDialog } from './secrets/SecretActionDialog'
import { SecretDiffDialog } from './secrets/SecretDiffDialog'
import { SecretRegistryRow } from './secrets/SecretRegistryRow'
import { SecretsTableHeader } from './secrets/SecretsTableHeader'
import { useSecretsEditor } from './secrets/useSecretsEditor'
import { SectionCard } from './SectionCard'

type SecretEditorChange = { id: string; key?: string; value?: string }

type CopySecretResult =
  | { created: string[]; updated: string[]; skipped: string[] }
  | {
      status: 'pending'
      approvalRequestId?: string
      approvalRequestIds?: string[]
    }
  | undefined

type CopyMissingResult =
  | {
      created: string[]
      updated: string[]
      skipped: string[]
      skippedDetails?: { key: string; reason: string; code: string }[]
    }
  | {
      status: 'pending'
      approvalRequestId?: string
      approvalRequestIds?: string[]
    }
  | undefined

type SecretsTableProps = {
  secrets: SecretDto[]
  environments: EnvironmentDto[]
  environmentId: string
  includeValues: boolean
  loading: boolean
  coverageLoading: boolean
  error: string | null
  missingKeys: string[]
  missingKeysByEnvironment: Record<string, string[]>
  pendingBySecretId?: Map<string, ApprovalRequestDto>
  onToggleValues: (next: boolean) => void
  onCreate: (payload: { key: string; value: string }) => Promise<boolean>
  onUpdateMany: (changes: SecretEditorChange[]) => Promise<void>
  onRollback: (secretId: string) => Promise<boolean>
  onDiff: (
    secretId: string,
    versions?: { from?: string; to?: string },
  ) => Promise<SecretDiffResponse>
  onListVersions: (secretId: string) => Promise<SecretVersionDto[]>
  onDelete: (secretId: string) => Promise<boolean>
  onCopy: (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => Promise<CopySecretResult>
  onCopyMissing: (
    sourceEnvironmentId: string,
    keys: string[],
    overwrite: boolean,
  ) => Promise<CopyMissingResult>
  searchValue?: string
  onSearchChange?: (value: string) => void
  className?: string
}

export const SecretsTable = ({
  secrets,
  environments,
  environmentId,
  includeValues,
  loading,
  coverageLoading,
  error,
  missingKeys,
  missingKeysByEnvironment,
  pendingBySecretId,
  onToggleValues,
  onCreate,
  onUpdateMany,
  onRollback,
  onDiff,
  onListVersions,
  onDelete,
  onCopy,
  onCopyMissing,
  searchValue,
  onSearchChange,
  className,
}: SecretsTableProps) => {
  const [activeSecret, setActiveSecret] = useState<SecretDto | null>(null)
  const [dialogMode, setDialogMode] = useState<
    'rollback' | 'delete' | 'copy' | 'diff' | null
  >(null)
  /** Per-row masks while global values are shown. Cleared when values are hidden. */
  const [maskedIds, setMaskedIds] = useState<Set<string>>(() => new Set())
  /** Row to leave unmasked after the next values load (click-to-reveal). */
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null)

  const openRollbackDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('rollback')
  }, [])

  const openDeleteDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('delete')
  }, [])

  const openCopyDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('copy')
  }, [])

  const openDiffDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('diff')
  }, [])

  const closeDialog = () => {
    setDialogMode(null)
    setActiveSecret(null)
  }

  const {
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
  } = useSecretsEditor({
    secrets,
    includeValues,
    onUpdateMany,
  })

  const otherEnvironments = useMemo(
    () => environments.filter((env) => env.id !== environmentId),
    [environments, environmentId],
  )

  const canCopy = otherEnvironments.length > 0

  useEffect(() => {
    if (!includeValues) {
      setMaskedIds(new Set())
      setPendingRevealId(null)
      setPendingEditId(null)
    }
  }, [includeValues])

  useEffect(() => {
    if (!includeValues || !pendingRevealId) return
    // List API loads all values at once — mask every other row.
    setMaskedIds(
      new Set(
        secrets
          .map((item) => item.id)
          .filter((id) => id !== pendingRevealId),
      ),
    )
    setPendingRevealId(null)
  }, [includeValues, pendingRevealId, secrets])

  useEffect(() => {
    if (!includeValues || !pendingEditId) return
    const secret = secrets.find((item) => item.id === pendingEditId)
    if (!secret || secret.value === undefined) return
    startEditingRow(secret)
    setMaskedIds((prev) => {
      if (!prev.has(secret.id)) return prev
      const next = new Set(prev)
      next.delete(secret.id)
      return next
    })
    setPendingEditId(null)
  }, [includeValues, pendingEditId, secrets, startEditingRow])

  const handleReveal = useCallback(
    (secret: SecretDto) => {
      // Values already loaded: unmask this row only.
      if (includeValues) {
        setMaskedIds((prev) => {
          if (!prev.has(secret.id)) return prev
          const next = new Set(prev)
          next.delete(secret.id)
          return next
        })
        return
      }
      setPendingRevealId(secret.id)
      onToggleValues(true)
    },
    [includeValues, onToggleValues],
  )

  const handleHide = useCallback((secretId: string) => {
    setMaskedIds((prev) => {
      if (prev.has(secretId)) return prev
      const next = new Set(prev)
      next.add(secretId)
      return next
    })
  }, [])

  const handleStartEdit = useCallback(
    (secret: SecretDto) => {
      if (includeValues && secret.value !== undefined) {
        startEditingRow(secret)
        return
      }
      setPendingEditId(secret.id)
      onToggleValues(true)
    },
    [includeValues, onToggleValues, startEditingRow],
  )

  const handleCopyValue = useCallback(async (secret: SecretDto) => {
    if (secret.value === undefined) return
    try {
      await navigator.clipboard.writeText(secret.value)
      setCopiedSecretId(secret.id)
      window.setTimeout(() => {
        setCopiedSecretId((current) => (current === secret.id ? null : current))
      }, 2000)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }, [])

  return (
    <SectionCard className={className}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-55">
          <h3 className="text-foreground text-lg font-semibold">
            Key registry
          </h3>
        </div>
      </div>
      <SecretsTableHeader
        secretCount={secrets.length}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        pendingChangesCount={pendingChangesCount}
        savingChanges={savingChanges}
        onSaveChanges={saveChanges}
        onDiscardChanges={discardChanges}
        onCreate={onCreate}
        includeValues={includeValues}
        onToggleValues={onToggleValues}
      />
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}
      {topError ? <ErrorBanner message={topError} className="mt-3" /> : null}

      <MissingKeysSection
        coverageLoading={coverageLoading}
        missingKeys={missingKeys}
        missingKeysByEnvironment={missingKeysByEnvironment}
        environments={environments}
        environmentId={environmentId}
        onCopyMissing={onCopyMissing}
      />

      <div
        className="mt-5 space-y-2 pt-6"
        data-show-values={includeValues ? 'true' : 'false'}
      >
        {loading ? (
          <div className="text-muted-foreground rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
            Loading secrets...
          </div>
        ) : secrets.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
            No secrets in this environment.
          </div>
        ) : (
          secrets.map((secret) => (
            <SecretRegistryRow
              key={secret.id}
              secret={secret}
              editingRow={editingRows[secret.id]}
              rowError={rowErrors[secret.id]}
              includeValues={includeValues}
              masked={maskedIds.has(secret.id)}
              canCopy={canCopy}
              justCopied={copiedSecretId === secret.id}
              pendingRequest={pendingBySecretId?.get(secret.id)}
              onReveal={handleReveal}
              onHide={handleHide}
              onCopyValue={handleCopyValue}
              onOpenCopy={openCopyDialog}
              onStartEdit={handleStartEdit}
              onCancelRow={cancelEditingRow}
              onOpenRollback={openRollbackDialog}
              onOpenDiff={openDiffDialog}
              onOpenDelete={openDeleteDialog}
              onRowKeyChange={handleRowKeyChange}
              onRowValueChange={handleRowValueChange}
            />
          ))
        )}
      </div>

      <SecretActionDialog
        mode={dialogMode === 'diff' ? null : dialogMode}
        secret={activeSecret}
        environments={environments}
        environmentId={environmentId}
        onCopy={onCopy}
        onRollback={onRollback}
        onDelete={onDelete}
        onClose={closeDialog}
      />
      <SecretDiffDialog
        open={dialogMode === 'diff'}
        secret={activeSecret}
        onClose={closeDialog}
        onDiff={onDiff}
        onListVersions={onListVersions}
      />
    </SectionCard>
  )
}
