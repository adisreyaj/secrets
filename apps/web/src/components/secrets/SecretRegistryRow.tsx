import { cn } from '@/lib/utils'
import type { ApprovalRequestDto, SecretDto } from '@secrets/shared'
import {
  Copy,
  Eye,
  EyeOff,
  History,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { memo } from 'react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Input } from '../ui/input'

type EditingRow = {
  key: string
  value: string
  dirtyKey: boolean
  dirtyValue: boolean
}

export type SecretRegistryRowProps = {
  secret: SecretDto
  editingRow?: EditingRow
  rowError?: string
  includeValues: boolean
  /** True when this row is locally re-masked while global values are shown. */
  masked: boolean
  canCopy: boolean
  justCopied?: boolean
  pendingRequest?: ApprovalRequestDto
  onReveal: (secret: SecretDto) => void
  onHide: (secretId: string) => void
  onCopyValue: (secret: SecretDto) => void
  onOpenCopy: (secret: SecretDto) => void
  onStartEdit: (secret: SecretDto) => void
  onCancelRow: (secretId: string) => void
  onOpenRollback: (secret: SecretDto) => void
  onOpenDiff: (secret: SecretDto) => void
  onOpenDelete: (secret: SecretDto) => void
  onRowKeyChange: (secretId: string, value: string) => void
  onRowValueChange: (secretId: string, value: string) => void
}

export const SecretRegistryRow = memo(
  ({
    secret,
    editingRow,
    rowError,
    includeValues,
    masked,
    canCopy,
    justCopied,
    pendingRequest,
    onReveal,
    onHide,
    onCopyValue,
    onOpenCopy,
    onStartEdit,
    onCancelRow,
    onOpenRollback,
    onOpenDiff,
    onOpenDelete,
    onRowKeyChange,
    onRowValueChange,
  }: SecretRegistryRowProps) => {
    const isEditing = !!editingRow
    const isPending = !!pendingRequest
    const valueAvailable = includeValues && secret.value !== undefined
    // Values load globally; maskedIds keeps non-revealed rows hidden.
    const showPlainValue = isEditing || (valueAvailable && !masked)

    return (
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {/* Key block */}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2.5 sm:max-w-[42%]',
            isEditing && 'flex-col items-stretch gap-1.5',
          )}
        >
          {isEditing ? (
            <>
              <Input
                value={editingRow?.key ?? ''}
                onChange={(event) =>
                  onRowKeyChange(secret.id, event.target.value)
                }
                size="xxs"
                placeholder="SECRET_KEY"
                className="font-mono"
              />
              {rowError ? (
                <p className="text-xs text-rose-600">{rowError}</p>
              ) : null}
            </>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="text-foreground truncate font-mono text-sm font-semibold tracking-tight">
                {secret.key}
              </p>
              {justCopied ? (
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  Copied
                </span>
              ) : null}
              {isPending ? (
                <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:bg-amber-950 dark:text-amber-300">
                  Pending
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Value block */}
        <div className="relative min-w-0 flex-1">
          <div
            className={cn(
              'flex h-full min-h-11 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1.5',
            )}
          >
            {isEditing ? (
              <div className="flex w-full items-center gap-2">
                <Input
                  value={editingRow?.value ?? ''}
                  onChange={(event) =>
                    onRowValueChange(secret.id, event.target.value)
                  }
                  size="xxs"
                  placeholder="New value"
                  className="flex-1 font-mono"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onCancelRow(secret.id)}
                  aria-label="Cancel edits"
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    showPlainValue ? onHide(secret.id) : onReveal(secret)
                  }
                  className={cn(
                    'group/value text-muted-foreground hover:text-foreground min-w-0 flex-1 truncate px-1.5 py-1 text-left font-mono text-xs transition-colors',
                    showPlainValue && 'text-foreground',
                  )}
                >
                  {showPlainValue ? (
                    <span className="block truncate">
                      {secret.value ?? '—'}
                    </span>
                  ) : includeValues && !masked ? (
                    <span className="font-sans tracking-normal">Loading…</span>
                  ) : (
                    <>
                      <span className="tracking-widest group-hover/value:hidden group-focus-visible/value:hidden">
                        ••••••
                      </span>
                      <span className="hidden font-sans tracking-normal group-hover/value:inline group-focus-visible/value:inline">
                        Click to reveal
                      </span>
                    </>
                  )}
                </button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground h-8 w-8 shrink-0"
                  onClick={() =>
                    showPlainValue ? onHide(secret.id) : onReveal(secret)
                  }
                  aria-label={showPlainValue ? 'Hide value' : 'Reveal value'}
                >
                  {showPlainValue ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground h-8 w-8 shrink-0"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="gap-2"
                      disabled={!valueAvailable}
                      onClick={() => onCopyValue(secret)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy value
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      disabled={!canCopy || isPending}
                      onClick={() => onOpenCopy(secret)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy to environments
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      disabled={isPending}
                      onClick={() => onStartEdit(secret)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => onOpenDiff(secret)}
                    >
                      <History className="h-4 w-4" />
                      View history
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      disabled={isPending}
                      onClick={() => onOpenRollback(secret)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore previous
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={isPending}
                      className="text-destructive focus:text-destructive gap-2"
                      onClick={() => onOpenDelete(secret)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>
    )
  },
)

SecretRegistryRow.displayName = 'SecretRegistryRow'
