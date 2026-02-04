import type { ApiTokenDto, CreateTokenResponse } from '@secrets/shared'
import { useState } from 'react'
import { X } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { ErrorBanner } from './ErrorBanner'
import { SectionCard, SectionHeader } from './SectionCard'
import { Button } from './ui/button'
import { CreateTokenDialog } from './tokens/CreateTokenDialog'
import { DeleteTokenDialog } from './tokens/DeleteTokenDialog'
import { TokenListItem } from './tokens/TokenListItem'

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
  onCreate: (
    name: string,
    readOnly: boolean,
  ) => Promise<CreateTokenResponse | null>
  onDelete: (tokenId: string) => Promise<void>
  lastCreated: CreateTokenResponse | null
  onClearLastCreated: () => void
}) => {
  const [activeToken, setActiveToken] = useState<ApiTokenDto | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
          <CreateTokenDialog
            onCreate={async (name, readOnly) => {
              await onCreate(name, readOnly)
            }}
          />
        }
      />
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}
      {lastCreated ? (
        <aside className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.3em] text-emerald-700 uppercase">
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
          <li>
            <EmptyState title="Loading tokens..." />
          </li>
        ) : tokens.length === 0 ? (
          <li>
            <EmptyState title="No API tokens yet." />
          </li>
        ) : (
          tokens.map((token) => (
            <TokenListItem
              key={token.id}
              token={token}
              onDelete={openDeleteDialog}
            />
          ))
        )}
      </ul>
      <aside className="border-border bg-muted text-muted-foreground mt-6 rounded-2xl border border-dashed p-4 text-xs">
        Tokens are visible once. Rotate frequently and scope by project.
      </aside>

      <DeleteTokenDialog
        open={deleteOpen}
        tokenName={activeToken?.name ?? null}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog()
        }}
        onConfirm={handleDelete}
      />
    </SectionCard>
  )
}
