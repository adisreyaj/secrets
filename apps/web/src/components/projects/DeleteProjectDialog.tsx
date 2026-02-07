import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../ErrorBanner'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'

export const DeleteProjectDialog = ({
  open,
  projectName,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  projectName: string
  deleting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (confirmText: string) => Promise<void>
}) => {
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (!open) {
      setConfirmText('')
    }
  }, [open])

  const canConfirm = useMemo(
    () => confirmText === projectName && !deleting,
    [confirmText, deleting, projectName],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            This permanently deletes the project and all related environments,
            secrets, API tokens, service accounts, and audit history.
          </DialogDescription>
        </DialogHeader>

        {error ? <ErrorBanner message={error} /> : null}

        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs">
            Type <span className="text-foreground font-semibold">{projectName}</span>{' '}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={projectName}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => onConfirm(confirmText)}
          >
            {deleting ? 'Deleting...' : 'Delete project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
