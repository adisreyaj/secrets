import type { ApiTokenDto, CreateTokenResponse } from '@secrets/shared'
import { useState } from 'react'
import { EmptyState } from './EmptyState'
import { ErrorBanner } from './ErrorBanner'
import { SectionCard, SectionHeader } from './SectionCard'
import { CreateTokenDialog } from './tokens/CreateTokenDialog'
import { DeleteTokenDialog } from './tokens/DeleteTokenDialog'
import { TokenListItem } from './tokens/TokenListItem'

export const TokensPanel = ({
  tokens,
  loading,
  error,
  onCreate,
  onDelete,
}: {
  tokens: ApiTokenDto[]
  loading: boolean
  error: string | null
  onCreate: (
    name: string,
    readOnly: boolean,
  ) => Promise<CreateTokenResponse | undefined>
  onDelete: (tokenId: string) => Promise<boolean>
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
    const deleted = await onDelete(activeToken.id)
    if (deleted) {
      closeDeleteDialog()
    }
  }

  return (
    <SectionCard>
      <SectionHeader
        kicker="API tokens"
        title="Programmatic access"
        action={<CreateTokenDialog onCreate={onCreate} />}
      />
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}
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
