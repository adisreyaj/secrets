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
    | {
        status: 'pending'
        approvalRequestId?: string
        approvalRequestIds?: string[]
      }
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
        if ('created' in result) {
          const createdCount = result.created.length
          const updatedCount = result.updated.length
          const skippedCount = result.skipped.length
          setCopyResult(
            `Copied to ${createdCount + updatedCount} environment${
              createdCount + updatedCount === 1 ? '' : 's'
            }.${skippedCount ? ` Skipped ${skippedCount}.` : ''}`,
          )
        }
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
            <div className="border-border bg-muted text-muted-foreground rounded-2xl border border-dashed p-3 text-xs">
              Copying{' '}
              <span className="text-foreground font-semibold">
                {secret?.key}
              </span>
            </div>
            {otherEnvironments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No other environments available.
              </p>
            ) : (
              <>
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setSelectedTargets(otherEnvironments.map((env) => env.id))
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSelectedTargets([])}
                  >
                    Clear
                  </Button>
                  <span>
                    Selected {selectedTargets.length} of{' '}
                    {otherEnvironments.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {otherEnvironments.map((env) => {
                    const checked = selectedTargets.includes(env.id)
                    return (
                      <label
                        key={env.id}
                        className="border-border text-muted-foreground flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-foreground font-semibold">
                            {env.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
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
                          className="border-border text-foreground h-4 w-4 rounded"
                        />
                      </label>
                    )
                  })}
                </div>
                <label className="text-muted-foreground flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(event) =>
                      setOverwriteExisting(event.target.checked)
                    }
                    className="border-border text-foreground h-4 w-4 rounded"
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
          <div className="border-border bg-muted text-muted-foreground rounded-2xl border border-dashed p-3 text-xs">
            Selected key{' '}
            <span className="text-foreground font-semibold">{secret?.key}</span>
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
