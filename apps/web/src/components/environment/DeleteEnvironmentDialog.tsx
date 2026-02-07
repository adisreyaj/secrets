import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../ErrorBanner'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'

type DeleteEnvironmentDialogProps = {
  open: boolean
  environmentName: string
  isLastEnvironment: boolean
  deleting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: {
    confirmText: string
    forceLastEnvironment: boolean
  }) => Promise<void>
}

export const DeleteEnvironmentDialog = ({
  open,
  environmentName,
  isLastEnvironment,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: DeleteEnvironmentDialogProps) => {
  const [confirmText, setConfirmText] = useState('')
  const [allowLastDelete, setAllowLastDelete] = useState(false)

  useEffect(() => {
    if (!open) {
      setConfirmText('')
      setAllowLastDelete(false)
    }
  }, [open])

  const canConfirm = useMemo(() => {
    if (confirmText !== environmentName || deleting) {
      return false
    }
    if (isLastEnvironment && !allowLastDelete) {
      return false
    }
    return true
  }, [allowLastDelete, confirmText, deleting, environmentName, isLastEnvironment])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete environment</DialogTitle>
          <DialogDescription>
            This permanently removes the environment and all secrets inside it.
          </DialogDescription>
        </DialogHeader>

        {error ? <ErrorBanner message={error} /> : null}

        {isLastEnvironment ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This is the last environment in the project. You must explicitly
            acknowledge this before deleting.
          </div>
        ) : null}

        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs">
            Type <span className="text-foreground font-semibold">{environmentName}</span>{' '}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={environmentName}
          />
        </div>

        {isLastEnvironment ? (
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <Checkbox
              checked={allowLastDelete}
              onCheckedChange={(checked) => setAllowLastDelete(Boolean(checked))}
            />
            I understand this will remove the final environment for this project.
          </label>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                confirmText,
                forceLastEnvironment: isLastEnvironment ? allowLastDelete : false,
              })
            }
          >
            {deleting ? 'Deleting...' : 'Delete environment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
