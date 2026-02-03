import type { EnvironmentDto, SecretDto } from '@secrets/shared'
import { memo, useCallback, useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { formatDateTime, formatKeyPreview } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  onUpdate,
  onRollback,
  onDelete,
  onCopy,
  onCopyMissing,
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
  onUpdate: (secretId: string, value: string) => Promise<void>
  onRollback: (secretId: string) => Promise<void>
  onDelete: (secretId: string) => Promise<void>
  onCopy: (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => Promise<{ created: string[]; updated: string[]; skipped: string[] }>
  onCopyMissing: (sourceEnvironmentId: string, keys: string[]) => Promise<{
    created: string[]
    updated: string[]
    skipped: string[]
  }>
}) => {
  const [form, setForm] = useState({ key: '', value: '' })
  const [creating, setCreating] = useState(false)
  const [activeSecret, setActiveSecret] = useState<SecretDto | null>(null)
  const [dialogMode, setDialogMode] = useState<
    'update' | 'rollback' | 'delete' | 'copy' | null
  >(null)
  const [nextValue, setNextValue] = useState('')
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)
  const [missingDialogOpen, setMissingDialogOpen] = useState(false)
  const [missingSourceEnvId, setMissingSourceEnvId] = useState<string | null>(null)
  const [missingCopying, setMissingCopying] = useState(false)
  const [selectedMissingKeys, setSelectedMissingKeys] = useState<string[]>([])

  const openUpdateDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('update')
    setNextValue('')
  }, [])

  const openRollbackDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('rollback')
  }, [])

  const openDeleteDialog = useCallback((secret: SecretDto) => {
    setActiveSecret(secret)
    setDialogMode('delete')
  }, [])

  const openCopyDialog = useCallback(
    (secret: SecretDto) => {
      setActiveSecret(secret)
      setDialogMode('copy')
      setCopyResult(null)
      setOverwriteExisting(false)
      setSelectedTargets(
        environments.filter((env) => env.id !== environmentId).map((env) => env.id),
      )
    },
    [environments, environmentId],
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.key.trim() || !form.value.trim() || creating) return
    setCreating(true)
    try {
      await onCreate({ key: form.key.trim(), value: form.value.trim() })
      setForm({ key: '', value: '' })
    } finally {
      setCreating(false)
    }
  }

  const closeDialog = () => {
    setDialogMode(null)
    setActiveSecret(null)
    setNextValue('')
    setSelectedTargets([])
    setOverwriteExisting(false)
    setCopying(false)
    setCopyResult(null)
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

  const activeMissingKeys =
    (missingSourceEnvId && missingKeysByEnvironment[missingSourceEnvId]) ?? []

  const selectedKeyCount = selectedMissingKeys.length
  const totalKeyCount = activeMissingKeys.length
  const missingSelectionLabel =
    selectedKeyCount === 0 ? '' : `Selected ${selectedKeyCount} of ${totalKeyCount}`

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

  const handleConfirm = async () => {
    if (!activeSecret || !dialogMode) return
    if (dialogMode === 'update') {
      if (!nextValue.trim()) return
      await onUpdate(activeSecret.id, nextValue.trim())
    }
    if (dialogMode === 'rollback') {
      await onRollback(activeSecret.id)
    }
    if (dialogMode === 'delete') {
      await onDelete(activeSecret.id)
    }
    if (dialogMode === 'copy') {
      if (selectedTargets.length === 0 || copying) return
      setCopying(true)
      try {
        const result = await onCopy(activeSecret.id, {
          targetEnvironmentIds: selectedTargets,
          overwrite: overwriteExisting,
        })
        const createdCount = result.created.length
        const updatedCount = result.updated.length
        const skippedCount = result.skipped.length
        setCopyResult(
          `Copied to ${createdCount + updatedCount} environment${
            createdCount + updatedCount === 1 ? '' : 's'
          }.${skippedCount ? ` Skipped ${skippedCount}.` : ''}`,
        )
      } finally {
        setCopying(false)
      }
      return
    }
    closeDialog()
  }

  const missingPreview = missingKeys.slice(0, 6)
  const missingOverflow = missingKeys.length - missingPreview.length
  const otherEnvironments = environments.filter((env) => env.id !== environmentId)

  return (
    <SectionCard>
      <SectionHeader
        kicker="Secrets"
        title="Key registry"
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onToggleValues(!includeValues)}
              className="gap-2 rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground hover:bg-muted/80"
            >
              {includeValues ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {includeValues ? 'Hide values' : 'Include values'}
            </Button>
          </div>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm">
        {coverageLoading ? (
          <p className="text-muted-foreground">Checking coverage across environments…</p>
        ) : missingKeys.length > 0 ? (
          <div className="space-y-2 text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Missing in this environment</p>
                <p className="text-xs text-muted-foreground">
                  These keys exist in other environments but not here.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => {
                  setMissingDialogOpen(true)
                  const first = missingSources[0]?.env.id ?? null
                  setMissingSourceEnvId(first)
                  setSelectedMissingKeys(
                    first ? missingKeysByEnvironment[first] ?? [] : [],
                  )
                }}
                disabled={missingSources.length === 0}
              >
                Add missing keys
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {missingPreview.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700"
                >
                  {key}
                </span>
              ))}
              {missingOverflow > 0 ? (
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground">
                  +{missingOverflow} more
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">All environments share the same keys.</p>
        )}
      </div>

      <Dialog
        open={missingDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeMissingDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add missing keys</DialogTitle>
            <DialogDescription>
              Choose a source environment to copy missing keys from.
            </DialogDescription>
          </DialogHeader>
          {missingSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No missing keys to copy.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    1
                  </span>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Source environment
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick the environment that has the keys you want to copy.
                </p>
                {missingSources.map(({ env, count }) => (
                  <label
                    key={env.id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{env.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {count} missing key{count === 1 ? '' : 's'} available
                      </p>
                    </div>
                    <input
                      type="radio"
                      name="missing-source"
                      value={env.id}
                      checked={missingSourceEnvId === env.id}
                      onChange={() => {
                        setMissingSourceEnvId(env.id)
                        setSelectedMissingKeys(missingKeysByEnvironment[env.id] ?? [])
                      }}
                      className="h-4 w-4 border-border text-foreground"
                    />
                  </label>
                ))}
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    2
                  </span>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Keys to add
                  </p>
                  {missingSelectionLabel ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {missingSelectionLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  This will only add keys that are missing in this environment.
                </p>
                {activeMissingKeys.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {activeMissingKeys.map((key) => {
                      const selected = selectedMissingKeys.includes(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setSelectedMissingKeys((prev) =>
                              prev.includes(key)
                                ? prev.filter((item) => item !== key)
                                : [...prev, key],
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            selected
                              ? 'border-amber-300 bg-amber-100 text-amber-800'
                              : 'border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {key}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                    onClick={() => setSelectedMissingKeys(activeMissingKeys)}
                    disabled={activeMissingKeys.length === 0}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                    onClick={() => setSelectedMissingKeys([])}
                    disabled={activeMissingKeys.length === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={closeMissingDialog} className="rounded-full">
              Cancel
            </Button>
            <Button
              onClick={handleMissingCopy}
              disabled={!missingSourceEnvId || missingCopying || selectedMissingKeys.length === 0}
              className="rounded-full"
            >
              {missingCopying ? 'Adding...' : 'Add keys'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-card/70 p-4"
      >
        <Input
          value={form.key}
          onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
          placeholder="SECRET_KEY"
          className="flex-1 rounded-full"
        />
        <Input
          value={form.value}
          onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
          placeholder="secret-value"
          className="flex-1 rounded-full"
        />
        <Button
          type="submit"
          className="gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Saving...' : 'Add secret'}
        </Button>
      </form>

      <div
        className="group mt-5 overflow-x-auto rounded-2xl border border-border"
        data-show-values={includeValues ? 'true' : 'false'}
      >
        <Table className="min-w-[760px] border-separate border-spacing-0">
          <TableCaption className="sr-only">Secrets list</TableCaption>
          <TableHeader className="bg-muted">
            <TableRow className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <TableHead>Key</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <SecretsTableBody
            secrets={secrets}
            loading={loading}
            canCopy={otherEnvironments.length > 0}
            onOpenDelete={openDeleteDialog}
            onOpenRollback={openRollbackDialog}
            onOpenUpdate={openUpdateDialog}
            onOpenCopy={openCopyDialog}
          />
        </Table>
      </div>

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'update'
                ? 'Update secret'
                : dialogMode === 'rollback'
                ? 'Rollback secret'
                : dialogMode === 'copy'
                ? 'Copy secret'
                : 'Delete secret'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'update'
                ? 'Enter the new value for this key.'
                : dialogMode === 'rollback'
                ? 'This will restore the previous version for the selected key.'
                : dialogMode === 'copy'
                ? 'Choose which environments should receive this key.'
                : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {dialogMode === 'update' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
                Updating{' '}
                <span className="font-semibold text-foreground">
                  {activeSecret?.key}
                </span>
              </div>
              <Input
                value={nextValue}
                onChange={(event) => setNextValue(event.target.value)}
                placeholder="New secret value"
                className="rounded-full"
              />
            </div>
          ) : dialogMode === 'copy' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
                Copying{' '}
                <span className="font-semibold text-foreground">
                  {activeSecret?.key}
                </span>
              </div>
              {otherEnvironments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other environments available.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                      onClick={() =>
                        setSelectedTargets(otherEnvironments.map((env) => env.id))
                      }
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                      onClick={() => setSelectedTargets([])}
                    >
                      Clear
                    </Button>
                    <span>
                      Selected {selectedTargets.length} of {otherEnvironments.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {otherEnvironments.map((env) => {
                      const checked = selectedTargets.includes(env.id)
                      return (
                        <label
                          key={env.id}
                          className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
                        >
                          <div>
                            <p className="font-semibold text-foreground">{env.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ID {env.id.slice(0, 6)}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedTargets((prev) => [...prev, env.id])
                              } else {
                                setSelectedTargets((prev) => prev.filter((id) => id !== env.id))
                              }
                            }}
                            className="h-4 w-4 rounded border-border text-foreground"
                          />
                        </label>
                      )
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={(event) => setOverwriteExisting(event.target.checked)}
                      className="h-4 w-4 rounded border-border text-foreground"
                    />
                    Overwrite existing values for this key
                  </label>
                  {copyResult ? (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      {copyResult}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
              Selected key{' '}
              <span className="font-semibold text-foreground">
                {activeSecret?.key}
              </span>
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={closeDialog} className="rounded-full">
              Cancel
            </Button>
            <Button
              variant={dialogMode === 'delete' ? 'outline' : 'default'}
              onClick={handleConfirm}
              disabled={
                (dialogMode === 'update' && !nextValue.trim()) ||
                (dialogMode === 'copy' &&
                  (selectedTargets.length === 0 || copying || otherEnvironments.length === 0))
              }
              className={
                dialogMode === 'delete'
                  ? 'rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700'
                  : 'rounded-full'
              }
            >
              {dialogMode === 'update'
                ? 'Update secret'
                : dialogMode === 'rollback'
                ? 'Confirm rollback'
                : dialogMode === 'copy'
                ? copying
                  ? 'Copying...'
                  : 'Copy secret'
                : 'Delete secret'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}

const SecretsTableBody = memo(
  ({
    secrets,
    loading,
    onOpenUpdate,
    onOpenRollback,
    onOpenDelete,
    onOpenCopy,
    canCopy,
  }: {
    secrets: SecretDto[]
    loading: boolean
    onOpenUpdate: (secret: SecretDto) => void
    onOpenRollback: (secret: SecretDto) => void
    onOpenDelete: (secret: SecretDto) => void
    onOpenCopy: (secret: SecretDto) => void
    canCopy: boolean
  }) => {
    return (
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell className="py-6 text-sm text-muted-foreground" colSpan={5}>
              Loading secrets...
            </TableCell>
          </TableRow>
        ) : secrets.length === 0 ? (
          <TableRow>
            <TableCell className="py-6 text-sm text-muted-foreground" colSpan={5}>
              No secrets in this environment.
            </TableCell>
          </TableRow>
        ) : (
          secrets.map((secret) => (
            <TableRow key={secret.id} className="text-sm text-muted-foreground">
              <TableHead className="py-3 font-semibold text-foreground">
                <p>{secret.key}</p>
                <p className="text-xs text-muted-foreground">
                  ID {secret.id.slice(0, 6)}
                </p>
              </TableHead>
              <TableCell className="py-3">
                <time dateTime={secret.updatedAt}>{formatDateTime(secret.updatedAt)}</time>
              </TableCell>
              <TableCell className="py-3">{secret.versionId?.slice(0, 6) ?? '—'}</TableCell>
              <TableCell className="py-3">
                <span className="inline group-data-[show-values=true]:hidden">Hidden</span>
                <span className="hidden group-data-[show-values=true]:inline">
                  {formatKeyPreview(secret.value)}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right">
                <div className="flex flex-wrap justify-end gap-2 text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenCopy(secret)}
                        className="h-7 gap-2 rounded-full px-3"
                        disabled={!canCopy}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy this key to other environments</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenUpdate(secret)}
                        className="h-7 gap-2 rounded-full px-3"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Update
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Update secret value</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenRollback(secret)}
                        className="h-7 gap-2 rounded-full px-3"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Rollback
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Restore previous value</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenDelete(secret)}
                        className="h-7 gap-2 rounded-full border-rose-200 bg-rose-50 px-3 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove secret</TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    )
  },
)
