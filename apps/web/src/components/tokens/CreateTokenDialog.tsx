import { useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useRegisterShortcut } from '../../lib/shortcuts'
import { ShortcutHint } from '../ShortcutHint'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { Input } from '../ui/input'

export const CreateTokenDialog = ({
  onCreate,
}: {
  onCreate: (name: string, readOnly: boolean) => Promise<void>
}) => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [creating, setCreating] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useRegisterShortcut('n', () => setOpen(true))

  useEffect(() => {
    if (open) {
      const timeout = window.setTimeout(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      }, 0)
      return () => window.clearTimeout(timeout)
    }
    setName('')
    setReadOnly(true)
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(name.trim(), readOnly)
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
        >
          <KeyRound className="h-4 w-4" />
          New token
          <ShortcutHint keys="n" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
        <DialogHeader className="text-left">
          <DialogTitle>Create API token</DialogTitle>
          <DialogDescription>
            Tokens are shown once. Store them securely before closing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
              Token name
            </span>
            <Input
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. CI deploy"
              autoComplete="off"
            />
          </label>
          <label className="text-muted-foreground flex items-center gap-3 text-sm">
            <Checkbox
              checked={readOnly}
              onCheckedChange={(checked) => setReadOnly(Boolean(checked))}
            />
            Read-only token (recommended for CI)
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-6 text-sm font-semibold"
              disabled={creating || !name.trim()}
            >
              {creating ? 'Creating...' : 'Create token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
