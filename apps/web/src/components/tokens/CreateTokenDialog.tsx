import type { CreateTokenResponse } from '@secrets/shared'
import { Copy, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export const CreateTokenDialog = ({
  onCreate,
}: {
  onCreate: (
    name: string,
    readOnly: boolean,
  ) => Promise<CreateTokenResponse | null>
}) => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [creating, setCreating] = useState(false)
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
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
    setIssuedToken(null)
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const result = await onCreate(name.trim(), readOnly)
      setIssuedToken(result?.token ?? null)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
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
            <span className="muted-label">Token name</span>
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
          {issuedToken ? (
            <div className="text-muted-foreground grid gap-2 text-xs">
              <p className="text-foreground font-semibold">New token</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-mono text-sm break-all text-emerald-800">
                  {issuedToken}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!issuedToken) return
                        await navigator.clipboard.writeText(issuedToken)
                      }}
                      aria-label="Copy token"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy token</TooltipContent>
                </Tooltip>
              </div>
              <p>This token is only visible now. Copy and store it securely.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {issuedToken ? 'Close' : 'Cancel'}
            </Button>
            {issuedToken ? null : (
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? 'Creating...' : 'Create token'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
