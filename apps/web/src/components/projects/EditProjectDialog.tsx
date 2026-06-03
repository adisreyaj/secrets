import type { ProjectDto } from '@secrets/shared'
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

const MAX_NAME_LENGTH = 80

export const EditProjectDialog = ({
  open,
  project,
  saving,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  project: ProjectDto | null
  saving: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => Promise<void>
}) => {
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) {
      setName(project?.name ?? '')
    }
  }, [open, project?.name])

  const trimmed = name.trim()
  const canSubmit = useMemo(
    () =>
      !saving &&
      trimmed.length > 0 &&
      trimmed.length <= MAX_NAME_LENGTH &&
      trimmed !== (project?.name ?? '').trim(),
    [saving, trimmed, project?.name],
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    await onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
        <DialogHeader className="text-left">
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Update the project name. The slug is preserved so existing URLs and
            integrations keep working.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Project name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Signalflow"
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              required
            />
            <span className="text-muted-foreground text-xs">
              {trimmed.length}/{MAX_NAME_LENGTH} characters
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
