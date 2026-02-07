import { Eye, EyeOff } from 'lucide-react'
import { ShortcutHint } from '../ShortcutHint'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AddSecretDialog } from './AddSecretDialog'

export const SecretsTableHeader = ({
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
      {typeof searchValue === 'string' && onSearchChange ? (
        <div className="flex max-w-80 flex-1 items-center gap-3">
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter by key or value..."
            size="xs"
            className="flex-1"
          />
        </div>
      ) : null}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        {pendingChangesCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
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
        <AddSecretDialog onCreate={onCreate} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onToggleValues(!includeValues)}
        >
          {includeValues ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {includeValues ? 'Hide values' : 'Show values'}
          <ShortcutHint keys="v" />
        </Button>
      </div>
    </div>
  )
}
