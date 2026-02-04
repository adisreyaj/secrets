import type { EnvironmentDto, SecretDto } from '@secrets/shared'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

type DialogMode = 'rollback' | 'delete' | 'copy' | null

export const SecretActionDialog = ({
  mode,
  secret,
  environments,
  environmentId,
  onCopy,
  onRollback,
  onDelete,
  onClose,
}: {
  mode: DialogMode
  secret: SecretDto | null
  environments: EnvironmentDto[]
  environmentId: string
  onCopy: (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => Promise<
    | { created: string[]; updated: string[]; skipped: string[] }
    | { status: 'pending'; approvalRequestId?: string; approvalRequestIds?: string[] }
  >
  onRollback: (secretId: string) => Promise<void>
  onDelete: (secretId: string) => Promise<void>
  onClose: () => void
}) => {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)

  const otherEnvironments = useMemo(
    () => environments.filter((env) => env.id !== environmentId),
    [environments, environmentId],
  )

  useEffect(() => {
    if (mode === 'copy') {
      setCopyResult(null)
      setOverwriteExisting(false)
      setSelectedTargets(otherEnvironments.map((env) => env.id))
    }
  }, [mode, otherEnvironments])

  const handleConfirm = async () => {
    if (!secret || !mode) return
    if (mode === 'rollback') {
      await onRollback(secret.id)
      onClose()
      return
    }
    if (mode === 'delete') {
      await onDelete(secret.id)
      onClose()
      return
    }
    if (mode === 'copy') {
      if (selectedTargets.length === 0 || copying) return
      setCopying(true)
      try {
        const result = await onCopy(secret.id, {
          targetEnvironmentIds: selectedTargets,
          overwrite: overwriteExisting,
        })
        if ('status' in result && result.status === 'pending') {
          setCopyResult('Approval requested for copy.')
          return
        }
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
    }
  }

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'rollback'
              ? 'Rollback secret'
              : mode === 'copy'
              ? 'Copy secret'
              : 'Delete secret'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'rollback'
              ? 'This will restore the previous version for the selected key.'
              : mode === 'copy'
              ? 'Choose which environments should receive this key.'
              : 'This action cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        {mode === 'copy' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
              Copying{' '}
              <span className="font-semibold text-foreground">{secret?.key}</span>
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
                              setSelectedTargets((prev) =>
                                prev.filter((id) => id !== env.id),
                              )
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
            <span className="font-semibold text-foreground">{secret?.key}</span>
          </div>
        )}
        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={onClose} className="rounded-full">
            Cancel
          </Button>
          <Button
            variant={mode === 'delete' ? 'outline' : 'default'}
            onClick={handleConfirm}
            disabled={
              mode === 'copy' &&
              (selectedTargets.length === 0 ||
                copying ||
                otherEnvironments.length === 0)
            }
            className={
              mode === 'delete'
                ? 'rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700'
                : 'rounded-full'
            }
          >
            {mode === 'rollback'
              ? 'Confirm rollback'
              : mode === 'copy'
              ? copying
                ? 'Copying...'
                : 'Copy secret'
              : 'Delete secret'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
