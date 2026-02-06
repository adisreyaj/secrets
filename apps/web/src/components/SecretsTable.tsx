import type {
  EnvironmentDto,
  SecretDiffResponse,
  SecretDto,
} from '@secrets/shared'
import {
  Copy,
  Eye,
  EyeOff,
  History,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { formatDateTime, formatKeyPreview } from '../lib/format'
import { AddSecretDialog } from './secrets/AddSecretDialog'
import { MissingKeysCard } from './secrets/MissingKeysCard'
import { MissingKeysDialog } from './secrets/MissingKeysDialog'
import { SecretActionDialog } from './secrets/SecretActionDialog'
import { useSecretsEditor } from './secrets/useSecretsEditor'
import { SectionCard } from './SectionCard'
import { ShortcutHint } from './ShortcutHint'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

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
  onToggleValues,
  onCreate,
  onUpdateMany,
  onRollback,
  onDiff,
  onDelete,
  onCopy,
  onCopyMissing,
  searchValue,
  onSearchChange,
  className,
}: {
  secrets: SecretDto[]
  environments: EnvironmentDto[]
  environmentId: string
  includeValues: boolean
  loading: boolean
  coverageLoading: boolean
  error: string | null
  missingKeys: string[]
  missingKeysByEnvironment: Record<string, string[]>
  onToggleValues: (next: boolean) => void
  onCreate: (payload: { key: string; value: string }) => Promise<void>
  onUpdateMany: (
    changes: { id: string; key?: string; value?: string }[],
  ) => Promise<void>
  onRollback: (secretId: string) => Promise<void>
  onDiff: (secretId: string) => Promise<SecretDiffResponse>
  onDelete: (secretId: string) => Promise<void>
  onCopy: (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => Promise<{ created: string[]; updated: string[]; skipped: string[] }>
  onCopyMissing: (
    sourceEnvironmentId: string,
    keys: string[],
  ) => Promise<{
    created: string[]
    updated: string[]
    skipped: string[]
  }>
  searchValue?: string
  onSearchChange?: (value: string) => void
  className?: string
}) => {
  const [activeSecret, setActiveSecret] = useState<SecretDto | null>(null)
  const [dialogMode, setDialogMode] = useState<
    'rollback' | 'delete' | 'copy' | 'diff' | null
  >(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<SecretDiffResponse | null>(null)
  const [missingDialogOpen, setMissingDialogOpen] = useState(false)
  const [missingSourceEnvId, setMissingSourceEnvId] = useState<string | null>(
    null,
  )
  const [missingCopying, setMissingCopying] = useState(false)
  const [selectedMissingKeys, setSelectedMissingKeys] = useState<string[]>([])

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

  const openDiffDialog = useCallback(
    async (secret: SecretDto) => {
      setActiveSecret(secret)
      setDialogMode('diff')
      setDiffLoading(true)
      setDiffError(null)
      setDiffData(null)
      try {
        const data = await onDiff(secret.id)
        setDiffData(data)
      } catch (error) {
        setDiffError(
          error instanceof Error ? error.message : 'Unable to load diff.',
        )
      } finally {
        setDiffLoading(false)
      }
    },
    [onDiff],
  )

  const closeDialog = () => {
    setDialogMode(null)
    setActiveSecret(null)
    setDiffData(null)
    setDiffError(null)
    setDiffLoading(false)
  }

  const closeMissingDialog = () => {
    setMissingDialogOpen(false)
    setMissingSourceEnvId(null)
    setMissingCopying(false)
    setSelectedMissingKeys([])
  }

  const missingSources = useMemo(() => {
    return environments
      .filter((env) => env.id !== environmentId)
      .map((env) => {
        const keys = missingKeysByEnvironment[env.id] ?? []
        return { env, count: keys.length }
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [environmentId, environments, missingKeysByEnvironment])

  const activeMissingKeys = missingSourceEnvId
    ? (missingKeysByEnvironment[missingSourceEnvId] ?? [])
    : []

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

  const handleMissingCopy = async () => {
    if (!missingSourceEnvId || missingCopying) return
    if (selectedMissingKeys.length === 0) return
    setMissingCopying(true)
    try {
      await onCopyMissing(missingSourceEnvId, selectedMissingKeys)
      closeMissingDialog()
    } finally {
      setMissingCopying(false)
    }
  }

  const otherEnvironments = environments.filter(
    (env) => env.id !== environmentId,
  )

  return (
    <SectionCard className={className}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-55">
          <h3 className="text-foreground text-lg font-semibold">
            Key registry
          </h3>
        </div>
        {typeof searchValue === 'string' && onSearchChange ? (
          <div className="flex min-w-60 flex-1 items-center gap-3">
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Filter by key or value..."
              data-testid="secrets-search"
              className="bg-background h-9 flex-1 rounded-2xl px-4"
            />
          </div>
        ) : null}
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          {pendingChangesCount > 0 ? (
            <>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {pendingChangesCount} pending
              </span>
              <Button
                size="sm"
                className="rounded-full px-4 text-xs"
                onClick={saveChanges}
                disabled={savingChanges}
              >
                {savingChanges ? 'Saving...' : 'Save changes'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full px-3 text-xs"
                onClick={discardChanges}
                disabled={savingChanges}
              >
                Discard
              </Button>
            </>
          ) : null}
          <AddSecretDialog onCreate={onCreate} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onToggleValues(!includeValues)}
            data-testid="secrets-toggle-values"
            className="bg-muted text-muted-foreground hover:bg-muted/80 flex h-9 items-center gap-2 rounded-full px-3 py-0 font-medium"
          >
            {includeValues ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {includeValues ? 'Hide values' : 'Show values'}
            <ShortcutHint keys="v" />
          </Button>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      {topError ? (
        <p className="mt-3 text-sm text-rose-600">{topError}</p>
      ) : null}

      <MissingKeysCard
        loading={coverageLoading}
        missingKeys={missingKeys}
        missingSourcesCount={missingSources.length}
        onOpenDialog={() => {
          setMissingDialogOpen(true)
          const first = missingSources[0]?.env.id ?? null
          setMissingSourceEnvId(first)
          setSelectedMissingKeys(
            first ? (missingKeysByEnvironment[first] ?? []) : [],
          )
        }}
      />

      <MissingKeysDialog
        open={missingDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeMissingDialog()
        }}
        missingSources={missingSources}
        missingSourceEnvId={missingSourceEnvId}
        onSelectSource={(envId) => {
          setMissingSourceEnvId(envId)
          setSelectedMissingKeys(missingKeysByEnvironment[envId] ?? [])
        }}
        activeMissingKeys={activeMissingKeys}
        selectedMissingKeys={selectedMissingKeys}
        setSelectedMissingKeys={setSelectedMissingKeys}
        onConfirm={handleMissingCopy}
        missingCopying={missingCopying}
      />

      <div
        className="group border-border mt-5 overflow-x-auto rounded-2xl border"
        data-show-values={includeValues ? 'true' : 'false'}
      >
        <Table className="min-w-190 border-separate border-spacing-0">
          <TableCaption className="sr-only">Secrets list</TableCaption>
          <TableHeader className="bg-muted">
            <TableRow className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <SecretsTableBody
            secrets={secrets}
            loading={loading}
            canCopy={otherEnvironments.length > 0}
            onOpenDelete={openDeleteDialog}
            onOpenRollback={openRollbackDialog}
            onOpenDiff={openDiffDialog}
            onStartEdit={startEditingRow}
            onOpenCopy={openCopyDialog}
            editingRows={editingRows}
            rowErrors={rowErrors}
            includeValues={includeValues}
            onRowKeyChange={handleRowKeyChange}
            onRowValueChange={handleRowValueChange}
            onCancelRow={cancelEditingRow}
          />
        </Table>
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
      <Dialog
        open={dialogMode === 'diff'}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog()
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Secret diff</DialogTitle>
            <DialogDescription>
              Compare the latest value with the previous version.
            </DialogDescription>
          </DialogHeader>
          {diffLoading ? (
            <p className="text-muted-foreground text-sm">Loading diff...</p>
          ) : diffError ? (
            <p className="text-sm text-rose-600">{diffError}</p>
          ) : diffData ? (
            <DiffViewer diff={diffData} />
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}

const DiffViewer = ({ diff }: { diff: SecretDiffResponse }) => {
  const previousLines = diff.previous.value.split(/\r?\n/)
  const currentLines = diff.current.value.split(/\r?\n/)
  const max = Math.max(previousLines.length, currentLines.length)
  const rows = Array.from({ length: max }, (_, index) => {
    const prev = previousLines[index] ?? ''
    const curr = currentLines[index] ?? ''
    const status =
      prev === curr
        ? 'same'
        : prev && !curr
          ? 'removed'
          : !prev && curr
            ? 'added'
            : 'changed'
    return { prev, curr, status, index }
  })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border-border bg-muted/40 rounded-2xl border p-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Previous
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Version {diff.previous.versionId.slice(0, 6)} ·{' '}
          {formatDateTime(diff.previous.createdAt)}
        </p>
        <div className="mt-3 space-y-1">
          {rows.map((row) => (
            <div
              key={`prev-${row.index}`}
              className={`text-foreground rounded-lg px-2 py-1 text-xs ${
                row.status === 'removed' || row.status === 'changed'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-background'
              }`}
            >
              <span className="text-muted-foreground mr-2 inline-block w-4 text-right text-[10px]">
                {row.index + 1}
              </span>
              {row.prev}
            </div>
          ))}
        </div>
      </div>
      <div className="border-border bg-muted/40 rounded-2xl border p-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Current
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Version {diff.current.versionId.slice(0, 6)} ·{' '}
          {formatDateTime(diff.current.createdAt)}
        </p>
        <div className="mt-3 space-y-1">
          {rows.map((row) => (
            <div
              key={`curr-${row.index}`}
              className={`text-foreground rounded-lg px-2 py-1 text-xs ${
                row.status === 'added' || row.status === 'changed'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-background'
              }`}
            >
              <span className="text-muted-foreground mr-2 inline-block w-4 text-right text-[10px]">
                {row.index + 1}
              </span>
              {row.curr}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const SecretsTableBody = memo(
  ({
    secrets,
    loading,
    onStartEdit,
    onOpenRollback,
    onOpenDiff,
    onOpenDelete,
    onOpenCopy,
    canCopy,
    editingRows,
    rowErrors,
    includeValues,
    onRowKeyChange,
    onRowValueChange,
    onCancelRow,
  }: {
    secrets: SecretDto[]
    loading: boolean
    onStartEdit: (secret: SecretDto) => void
    onOpenRollback: (secret: SecretDto) => void
    onOpenDiff: (secret: SecretDto) => void
    onOpenDelete: (secret: SecretDto) => void
    onOpenCopy: (secret: SecretDto) => void
    canCopy: boolean
    editingRows: Record<
      string,
      { key: string; value: string; dirtyKey: boolean; dirtyValue: boolean }
    >
    rowErrors: Record<string, string>
    includeValues: boolean
    onRowKeyChange: (secretId: string, value: string) => void
    onRowValueChange: (secretId: string, value: string) => void
    onCancelRow: (secretId: string) => void
  }) => {
    return (
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell
              className="text-muted-foreground py-6 text-sm"
              colSpan={5}
            >
              Loading secrets...
            </TableCell>
          </TableRow>
        ) : secrets.length === 0 ? (
          <TableRow>
            <TableCell
              className="text-muted-foreground py-6 text-sm"
              colSpan={5}
            >
              No secrets in this environment.
            </TableCell>
          </TableRow>
        ) : (
          secrets.map((secret) => (
            <SecretRow
              key={secret.id}
              secret={secret}
              editingRow={editingRows[secret.id]}
              rowError={rowErrors[secret.id]}
              includeValues={includeValues}
              canCopy={canCopy}
              onOpenCopy={onOpenCopy}
              onStartEdit={onStartEdit}
              onCancelRow={onCancelRow}
              onOpenRollback={onOpenRollback}
              onOpenDiff={onOpenDiff}
              onOpenDelete={onOpenDelete}
              onRowKeyChange={onRowKeyChange}
              onRowValueChange={onRowValueChange}
            />
          ))
        )}
      </TableBody>
    )
  },
)

const SecretRow = memo(
  ({
    secret,
    editingRow,
    rowError,
    includeValues,
    canCopy,
    onOpenCopy,
    onStartEdit,
    onCancelRow,
    onOpenRollback,
    onOpenDiff,
    onOpenDelete,
    onRowKeyChange,
    onRowValueChange,
  }: {
    secret: SecretDto
    editingRow?: {
      key: string
      value: string
      dirtyKey: boolean
      dirtyValue: boolean
    }
    rowError?: string
    includeValues: boolean
    canCopy: boolean
    onOpenCopy: (secret: SecretDto) => void
    onStartEdit: (secret: SecretDto) => void
    onCancelRow: (secretId: string) => void
    onOpenRollback: (secret: SecretDto) => void
    onOpenDiff: (secret: SecretDto) => void
    onOpenDelete: (secret: SecretDto) => void
    onRowKeyChange: (secretId: string, value: string) => void
    onRowValueChange: (secretId: string, value: string) => void
  }) => {
    const isEditing = !!editingRow
    return (
      <TableRow
        className="text-muted-foreground text-sm"
        data-testid={`secret-row-${secret.id}`}
      >
        <TableHead className="text-foreground py-3 font-semibold" scope="row">
          {isEditing ? (
            <div className="space-y-1">
              <Input
                value={editingRow?.key ?? ''}
                onChange={(event) =>
                  onRowKeyChange(secret.id, event.target.value)
                }
                className="h-8 rounded-lg"
                placeholder="SECRET_KEY"
              />
              {rowError ? (
                <p className="text-xs text-rose-600">{rowError}</p>
              ) : null}
            </div>
          ) : (
            <p>{secret.key}</p>
          )}
        </TableHead>
        <TableCell className="py-3">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editingRow?.value ?? ''}
                onChange={(event) =>
                  onRowValueChange(secret.id, event.target.value)
                }
                className="h-8 rounded-lg"
                placeholder="New value"
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2 text-xs"
                  onClick={() => onRowValueChange(secret.id, 'true')}
                >
                  true
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2 text-xs"
                  onClick={() => onRowValueChange(secret.id, 'false')}
                >
                  false
                </Button>
              </div>
            </div>
          ) : includeValues ? (
            <span>{formatKeyPreview(secret.value)}</span>
          ) : (
            <span>*******</span>
          )}
        </TableCell>
        <TableCell className="py-3">
          {secret.versionId?.slice(0, 6) ?? '—'}
        </TableCell>
        <TableCell className="py-3">
          <time dateTime={secret.updatedAt}>
            {formatDateTime(secret.updatedAt)}
          </time>
        </TableCell>
        <TableCell className="py-3 text-right">
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onOpenCopy(secret)}
                  data-testid={`secret-copy-${secret.id}`}
                  className="h-8 w-8 rounded-full"
                  disabled={!canCopy || isEditing}
                  aria-label="Copy secret"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Copy this key to other environments
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onStartEdit(secret)}
                  data-testid={`secret-edit-${secret.id}`}
                  className="h-8 w-8 rounded-full"
                  disabled={isEditing}
                  aria-label="Edit secret"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit secret key or value</TooltipContent>
            </Tooltip>
            {isEditing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onCancelRow(secret.id)}
                    data-testid={`secret-cancel-${secret.id}`}
                    className="h-8 w-8 rounded-full"
                    aria-label="Cancel edits"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel edits for this row</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onOpenRollback(secret)}
                  data-testid={`secret-rollback-${secret.id}`}
                  className="h-8 w-8 rounded-full"
                  disabled={isEditing}
                  aria-label="Rollback secret"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restore previous value</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onOpenDiff(secret)}
                  data-testid={`secret-diff-${secret.id}`}
                  className="h-8 w-8 rounded-full"
                  disabled={isEditing}
                  aria-label="View diff"
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View last change</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onOpenDelete(secret)}
                  data-testid={`secret-delete-${secret.id}`}
                  className="h-8 w-8 rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                  disabled={isEditing}
                  aria-label="Delete secret"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove secret</TooltipContent>
            </Tooltip>
          </div>
        </TableCell>
      </TableRow>
    )
  },
)
