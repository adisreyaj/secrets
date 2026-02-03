import type { ApiTokenDto, CreateTokenResponse } from '@secrets/shared'
import { useState } from 'react'
import { KeyRound, Trash2, X } from 'lucide-react'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'

export const TokensPanel = ({
  tokens,
  loading,
  error,
  onCreate,
  onDelete,
  lastCreated,
  onClearLastCreated,
}: {
  tokens: ApiTokenDto[]
  loading: boolean
  error: string | null
  onCreate: (name: string) => Promise<CreateTokenResponse | null>
  onDelete: (tokenId: string) => Promise<void>
  lastCreated: CreateTokenResponse | null
  onClearLastCreated: () => void
}) => {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [activeToken, setActiveToken] = useState<ApiTokenDto | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(name.trim())
      setName('')
    } finally {
      setCreating(false)
    }
  }

  const openDeleteDialog = (token: ApiTokenDto) => {
    setActiveToken(token)
    setDeleteOpen(true)
  }

  const closeDeleteDialog = () => {
    setDeleteOpen(false)
    setActiveToken(null)
  }

  const handleDelete = async () => {
    if (!activeToken) return
    await onDelete(activeToken.id)
    closeDeleteDialog()
  }

  return (
    <SectionCard>
      <SectionHeader
        kicker="API tokens"
        title="Programmatic access"
        action={
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Token name"
              className="w-[180px] rounded-full bg-background"
            />
            <Button
              type="submit"
              variant="outline"
              className="gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            >
              <KeyRound className="h-4 w-4" />
              {creating ? 'Creating...' : 'New token'}
            </Button>
          </form>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      {lastCreated ? (
        <aside className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">
                Token created (copy once)
              </p>
              <p className="mt-2 font-mono text-sm">{lastCreated.token}</p>
            </div>
            <Button
              variant="link"
              className="h-auto gap-1 px-0 text-xs font-semibold text-emerald-700"
              onClick={onClearLastCreated}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </aside>
      ) : null}
      <ul className="mt-5 space-y-3">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Loading tokens...
          </li>
        ) : tokens.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            No API tokens yet.
          </li>
        ) : (
          tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
            >
              <article>
                <p className="font-semibold text-foreground">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  Created <time dateTime={token.createdAt}>{formatDateTime(token.createdAt)}</time>
                </p>
              </article>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Last used{' '}
                  <time dateTime={token.lastUsedAt}>{formatDateTime(token.lastUsedAt)}</time>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDeleteDialog(token)}
                  className="h-7 gap-2 rounded-full border-rose-200 bg-rose-50 px-3 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
      <aside className="mt-6 rounded-2xl border border-dashed border-border bg-muted p-4 text-xs text-muted-foreground">
        Tokens are visible once. Rotate frequently and scope by project.
      </aside>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API token</DialogTitle>
            <DialogDescription>This token will stop working immediately.</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
            Selected token{' '}
            <span className="font-semibold text-foreground">{activeToken?.name}</span>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={closeDeleteDialog} className="rounded-full">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-full">
              Delete token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
