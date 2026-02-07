import type {
  ApprovalRequestDto,
  EnvironmentDto,
  SecretDiffResponse,
  SecretDto,
  SecretVersionDto,
} from '@secrets/shared'
import { Copy, History, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { formatDateTime, formatKeyPreview } from '../lib/format'
import { ErrorBanner } from './ErrorBanner'
import { MissingKeysSection } from './secrets/MissingKeysSection'
import { SecretActionDialog } from './secrets/SecretActionDialog'
import { SecretDiffDialog } from './secrets/SecretDiffDialog'
import { SecretsTableHeader } from './secrets/SecretsTableHeader'
import { useSecretsEditor } from './secrets/useSecretsEditor'
import { SectionCard } from './SectionCard'
import { Button } from './ui/button'
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
  onCreate: (payload: { key: string; value: string }) => Promise<void>
  onUpdateMany: (changes: SecretEditorChange[]) => Promise<void>
  onRollback: (secretId: string) => Promise<void>
  onDiff: (
    secretId: string,
    versions?: { from?: string; to?: string },
  ) => Promise<SecretDiffResponse>
  onListVersions: (secretId: string) => Promise<SecretVersionDto[]>
  onDelete: (secretId: string) => Promise<void>
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

type SecretsTableBodyProps = {
  secrets: SecretDto[]
  loading: boolean
  onStartEdit: (secret: SecretDto) => void
  onOpenRollback: (secret: SecretDto) => void
  onOpenDiff: (secret: SecretDto) => void
  onOpenDelete: (secret: SecretDto) => void
  onOpenCopy: (secret: SecretDto) => void
  canCopy: boolean
  pendingBySecretId?: Map<string, ApprovalRequestDto>
  editingRows: Record<
    string,
    { key: string; value: string; dirtyKey: boolean; dirtyValue: boolean }
  >
  rowErrors: Record<string, string>
  includeValues: boolean
  onRowKeyChange: (secretId: string, value: string) => void
  onRowValueChange: (secretId: string, value: string) => void
  onCancelRow: (secretId: string) => void
}

type SecretRowProps = {
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
  pendingRequest?: ApprovalRequestDto
  onOpenCopy: (secret: SecretDto) => void
  onStartEdit: (secret: SecretDto) => void
  onCancelRow: (secretId: string) => void
  onOpenRollback: (secret: SecretDto) => void
  onOpenDiff: (secret: SecretDto) => void
  onOpenDelete: (secret: SecretDto) => void
  onRowKeyChange: (secretId: string, value: string) => void
  onRowValueChange: (secretId: string, value: string) => void
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
        className="group border-border mt-5 overflow-x-auto rounded-2xl border"
        data-show-values={includeValues ? 'true' : 'false'}
      >
        <Table className="min-w-190 border-separate border-spacing-0">
          <TableCaption className="sr-only">Secrets list</TableCaption>
          <TableHeader className="bg-muted">
            <TableRow className="text-muted-foreground text-xs tracking-[0.1em] uppercase">
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
            pendingBySecretId={pendingBySecretId}
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
    pendingBySecretId,
    editingRows,
    rowErrors,
    includeValues,
    onRowKeyChange,
    onRowValueChange,
    onCancelRow,
  }: SecretsTableBodyProps) => {
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
              pendingRequest={pendingBySecretId?.get(secret.id)}
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
    pendingRequest,
    onOpenCopy,
    onStartEdit,
    onCancelRow,
    onOpenRollback,
    onOpenDiff,
    onOpenDelete,
    onRowKeyChange,
    onRowValueChange,
  }: SecretRowProps) => {
    const isEditing = !!editingRow
    const isPending = !!pendingRequest
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
                size="xxs"
                placeholder="SECRET_KEY"
              />
              {rowError ? (
                <p className="text-xs text-rose-600">{rowError}</p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p>{secret.key}</p>
              {isPending ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-amber-700 uppercase">
                  Pending
                </span>
              ) : null}
            </div>
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
                size="xxs"
                placeholder="New value"
              />
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
                  disabled={!canCopy || isEditing || isPending}
                  aria-label="Copy secret"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Copy this key to other environments
              </TooltipContent>
            </Tooltip>
            {isEditing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onCancelRow(secret.id)}
                    aria-label="Cancel edits"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel edits for this row</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onStartEdit(secret)}
                    disabled={isEditing || isPending}
                    aria-label="Edit secret"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit secret key or value</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onOpenRollback(secret)}
                  disabled={isEditing || isPending}
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
                  variant="destructive"
                  onClick={() => onOpenDelete(secret)}
                  disabled={isEditing || isPending}
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
