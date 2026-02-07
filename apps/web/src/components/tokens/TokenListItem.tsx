import type { ApiTokenDto } from '@secrets/shared'
import { Trash2 } from 'lucide-react'
import { formatDateTime } from '../../lib/format'
import { Button } from '../ui/button'

export const TokenListItem = ({
  token,
  onDelete,
}: {
  token: ApiTokenDto
  onDelete: (token: ApiTokenDto) => void
}) => {
  return (
    <li className="border-border bg-card flex items-center justify-between rounded-2xl border px-4 py-3">
      <article>
        <div className="flex items-center gap-2">
          <p className="text-foreground font-semibold">{token.name}</p>
          {token.readOnly ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
              Read-only
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Created{' '}
          <time dateTime={token.createdAt}>
            {formatDateTime(token.createdAt)}
          </time>
        </p>
      </article>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs">
          Last used{' '}
          <time dateTime={token.lastUsedAt ?? undefined}>
            {formatDateTime(token.lastUsedAt)}
          </time>
        </span>
        <Button size="sm" variant="destructive" onClick={() => onDelete(token)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </li>
  )
}
