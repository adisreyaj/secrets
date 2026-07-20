import { Eye, EyeOff, Search } from 'lucide-react'
import { ShortcutHint } from '../ShortcutHint'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AddSecretDialog } from './AddSecretDialog'

export const SecretsTableHeader = ({
  secretCount,
  searchValue,
  onSearchChange,
  pendingChangesCount,
  savingChanges,
  onSaveChanges,
  onDiscardChanges,
  onCreate,
  includeValues,
  onToggleValues,
}: {
    secretCount: number
  searchValue?: string
  onSearchChange?: (value: string) => void
  pendingChangesCount: number
  savingChanges: boolean
  onSaveChanges: () => void
  onDiscardChanges: () => void
  onCreate: (payload: { key: string; value: string }) => Promise<boolean>
  includeValues: boolean
  onToggleValues: (next: boolean) => void
}) => {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <p className="text-muted-foreground shrink-0 text-sm">
          Active{' '}
          <span className="text-foreground font-semibold tabular-nums">
            ({secretCount})
          </span>
        </p>
        {typeof searchValue === 'string' && onSearchChange ? (
          <div className="relative max-w-72 min-w-40 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search for a secret..."
              size="xs"
              className="pl-8"
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pendingChangesCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {pendingChangesCount} pending
            </span>
            <Button size="sm" onClick={onSaveChanges} disabled={savingChanges}>
              {savingChanges ? 'Saving...' : 'Save changes'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDiscardChanges}
              disabled={savingChanges}
            >
              Discard
            </Button>
          </div>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="h-9 gap-1.5 px-2.5"
          onClick={() => onToggleValues(!includeValues)}
          aria-label={includeValues ? 'Hide values' : 'Show values'}
          title={includeValues ? 'Hide values' : 'Show values'}
        >
          {includeValues ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {includeValues ? 'Hide values' : 'Show values'}
          </span>
          <ShortcutHint keys="v" />
        </Button>
        <AddSecretDialog onCreate={onCreate} />
      </div>
    </div>
  )
}
