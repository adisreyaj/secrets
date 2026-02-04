import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useRegisterShortcut } from '../../lib/shortcuts'
import { ShortcutHint } from '../ShortcutHint'
import { Button } from '../ui/button'
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

type ParseResult = {
  key: string
  value: string
  error: string | null
  hint?: string | null
}

const parsePasteLine = (raw: string): ParseResult => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { key: '', value: '', error: null }
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return { key: '', value: '', error: null }
  }

  let line = lines[0].trim()
  const hint = lines.length > 1 ? 'Only the first line was used.' : null

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim()
  }

  const equalsIndex = line.indexOf('=')
  if (equalsIndex === -1) {
    return { key: '', value: '', error: 'Use the format KEY=VALUE.' }
  }

  const key = line.slice(0, equalsIndex).trim()
  let value = line.slice(equalsIndex + 1).trim()
  if (!key || !value) {
    return { key: '', value: '', error: 'Both key and value are required.' }
  }

  const firstChar = value[0]
  const lastChar = value[value.length - 1]
  if (
    (firstChar === '"' && lastChar === '"') ||
    (firstChar === "'" && lastChar === "'")
  ) {
    value = value.slice(1, -1)
  }

  if (!value.trim()) {
    return { key: '', value: '', error: 'Both key and value are required.' }
  }

  return { key, value, error: null, hint }
}

export const AddSecretDialog = ({
  onCreate,
}: {
  onCreate: (payload: { key: string; value: string }) => Promise<void>
}) => {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ key: '', value: '' })
  const [pasteLine, setPasteLine] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const [showPasteInput, setShowPasteInput] = useState(false)
  const [creating, setCreating] = useState(false)

  useRegisterShortcut('n', () => setOpen(true))

  const reset = () => {
    setForm({ key: '', value: '' })
    setPasteLine('')
    setPasteError(null)
    setPasteHint(null)
    setShowPasteInput(false)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.key.trim() || !form.value.trim() || creating) return
    setCreating(true)
    try {
      await onCreate({ key: form.key.trim(), value: form.value.trim() })
      reset()
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex h-9 items-center gap-2 rounded-full text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add secret
          <ShortcutHint keys="n" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="text-left">
          <DialogTitle>Add secret</DialogTitle>
          <DialogDescription>
            Create a new secret key/value pair for this environment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Secret details
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => {
                setShowPasteInput((prev) => !prev)
                if (showPasteInput) {
                  setPasteLine('')
                  setPasteError(null)
                  setPasteHint(null)
                }
              }}
            >
              {showPasteInput ? (
                <>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Hide paste
                </>
              ) : (
                'Paste .env line'
              )}
            </Button>
          </div>

          {showPasteInput ? (
            <label className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Paste key=value
              </span>
              <Input
                value={pasteLine}
                onChange={(event) => {
                  const next = event.target.value
                  setPasteLine(next)
                  if (!next.trim()) {
                    setPasteError(null)
                    setPasteHint(null)
                    return
                  }
                  const parsed = parsePasteLine(next)
                  setPasteError(parsed.error ?? null)
                  setPasteHint(parsed.hint ?? null)
                  if (!parsed.error && parsed.key && parsed.value) {
                    setForm({ key: parsed.key, value: parsed.value })
                  }
                }}
                placeholder="SECRET_KEY=secret-value"
              />
              {pasteError ? (
                <span className="text-xs text-rose-600">{pasteError}</span>
              ) : null}
              {!pasteError && pasteHint ? (
                <span className="text-xs text-muted-foreground">{pasteHint}</span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                We’ll split this into key and value automatically.
              </span>
            </label>
          ) : null}

          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Secret key
            </span>
            <Input
              value={form.key}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  key: event.target.value,
                }))
              }
              placeholder="SECRET_KEY"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Secret value
            </span>
            <Input
              value={form.value}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  value: event.target.value,
                }))
              }
              placeholder="secret-value"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Quick set:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setForm((prev) => ({ ...prev, value: 'true' }))}
              >
                true
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setForm((prev) => ({ ...prev, value: 'false' }))}
              >
                false
              </Button>
            </div>
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
              className="rounded-full px-6 text-sm font-semibold"
              disabled={creating || !form.key.trim() || !form.value.trim()}
            >
              {creating ? 'Saving...' : 'Add secret'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
