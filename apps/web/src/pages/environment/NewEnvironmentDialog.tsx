import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ShortcutHint } from '../../components/ShortcutHint'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { useRegisterShortcut } from '../../lib/shortcuts'

export const NewEnvironmentDialog = ({
  environmentOptions,
  onCreateEnvironment,
}: {
  environmentOptions: { id: string; name: string }[]
  onCreateEnvironment: (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => Promise<boolean>
}) => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copyFromId, setCopyFromId] = useState<string>('none')

  useRegisterShortcut('shift+n', () => setOpen(true))

  useEffect(() => {
    if (!open) {
      setName('')
      setCopyFromId('none')
    }
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      const created = await onCreateEnvironment({
        name: trimmedName,
        copyFromEnvironmentId: copyFromId !== 'none' ? copyFromId : undefined,
      })
      if (created) {
        setOpen(false)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          New environment
          <ShortcutHint keys="Shift+n" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
        <DialogHeader className="text-left">
          <DialogTitle>Create environment</DialogTitle>
          <DialogDescription>
            Spin up a new environment and optionally duplicate keys from an
            existing one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Environment name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. staging"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Copy keys from</span>
            <Select
              value={copyFromId}
              onValueChange={setCopyFromId}
              disabled={environmentOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Don't copy anything" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Don&apos;t copy anything</SelectItem>
                {environmentOptions.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-xs">
              Copies keys (and current values) into the new environment.
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? 'Creating...' : 'Create environment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
