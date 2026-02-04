import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

export const DeleteTokenDialog = ({
  open,
  tokenName,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  tokenName: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete API token</DialogTitle>
          <DialogDescription>
            This token will stop working immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="border-border bg-muted text-muted-foreground rounded-2xl border border-dashed p-3 text-xs">
          Selected token{' '}
          <span className="text-foreground font-semibold">{tokenName}</span>
        </div>
        <DialogFooter className="mt-6">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="rounded-full"
          >
            Delete token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
