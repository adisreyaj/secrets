import type { EnvironmentDto } from '@secrets/shared'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

type MissingSource = { env: EnvironmentDto; count: number }

export const MissingKeysDialog = ({
  open,
  onOpenChange,
  missingSources,
  missingSourceEnvId,
  onSelectSource,
  activeMissingKeys,
  selectedMissingKeys,
  setSelectedMissingKeys,
  onConfirm,
  missingCopying,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingSources: MissingSource[]
  missingSourceEnvId: string | null
  onSelectSource: (envId: string) => void
  activeMissingKeys: string[]
  selectedMissingKeys: string[]
  setSelectedMissingKeys: (keys: string[]) => void
  onConfirm: () => void
  missingCopying: boolean
}) => {
  const selectedKeyCount = selectedMissingKeys.length
  const totalKeyCount = activeMissingKeys.length
  const missingSelectionLabel =
    selectedKeyCount === 0 ? '' : `Selected ${selectedKeyCount} of ${totalKeyCount}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add missing keys</DialogTitle>
          <DialogDescription>
            Choose a source environment to copy missing keys from.
          </DialogDescription>
        </DialogHeader>
        {missingSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No missing keys to copy.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-border/70 bg-card/80 p-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  1
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Source environment
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Pick the environment that has the keys you want to copy.
              </p>
              {missingSources.map(({ env, count }) => (
                <label
                  key={env.id}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
                >
                  <div>
                    <p className="font-semibold text-foreground">{env.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} missing key{count === 1 ? '' : 's'} available
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="missing-source"
                    value={env.id}
                    checked={missingSourceEnvId === env.id}
                    onChange={() => onSelectSource(env.id)}
                    className="h-4 w-4 border-border text-foreground"
                  />
                </label>
              ))}
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Keys to add
                </p>
                {missingSelectionLabel ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {missingSelectionLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                This will only add keys that are missing in this environment.
              </p>
              {activeMissingKeys.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {activeMissingKeys.map((key) => {
                    const selected = selectedMissingKeys.includes(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setSelectedMissingKeys(
                            selected
                              ? selectedMissingKeys.filter((item) => item !== key)
                              : [...selectedMissingKeys, key],
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          selected
                            ? 'border-amber-300 bg-amber-100 text-amber-800'
                            : 'border-border bg-muted text-muted-foreground'
                        }`}
                      >
                        {key}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                  onClick={() => setSelectedMissingKeys(activeMissingKeys)}
                  disabled={activeMissingKeys.length === 0}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                  onClick={() => setSelectedMissingKeys([])}
                  disabled={activeMissingKeys.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            data-testid="missing-keys-confirm"
            disabled={!missingSourceEnvId || missingCopying || selectedMissingKeys.length === 0}
            className="rounded-full"
          >
            {missingCopying ? 'Adding...' : 'Add keys'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
