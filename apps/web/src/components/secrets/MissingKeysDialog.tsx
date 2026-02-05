import type { EnvironmentDto } from '@secrets/shared'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
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
  overwriteExisting,
  setOverwriteExisting,
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
  overwriteExisting: boolean
  setOverwriteExisting: (value: boolean) => void
}) => {
  const selectedKeyCount = selectedMissingKeys.length
  const totalKeyCount = activeMissingKeys.length
  const missingSelectionLabel =
    selectedKeyCount === 0
      ? ''
      : `Selected ${selectedKeyCount} of ${totalKeyCount}`

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
          <p className="text-muted-foreground text-sm">
            No missing keys to copy.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="border-border/70 bg-card/80 space-y-2 rounded-2xl border p-3">
              <div className="flex items-center gap-2">
                <span className="bg-muted text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold">
                  1
                </span>
                <p className="muted-label">Source environment</p>
              </div>
              <p className="text-muted-foreground text-xs">
                Pick the environment that has the keys you want to copy.
              </p>
              {missingSources.map(({ env, count }) => (
                <label
                  key={env.id}
                  className="border-border text-muted-foreground flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="text-foreground font-semibold">{env.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {count} missing key{count === 1 ? '' : 's'} available
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="missing-source"
                    value={env.id}
                    checked={missingSourceEnvId === env.id}
                    onChange={() => onSelectSource(env.id)}
                    className="border-border text-foreground h-4 w-4"
                  />
                </label>
              ))}
            </div>
            <div className="border-border/70 bg-card/80 rounded-2xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-muted text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold">
                  2
                </span>
                <p className="muted-label">Keys to add</p>
                {missingSelectionLabel ? (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {missingSelectionLabel}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
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
                              ? selectedMissingKeys.filter(
                                  (item) => item !== key,
                                )
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
              <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground h-7 rounded-full px-3 text-xs font-semibold"
                  onClick={() => setSelectedMissingKeys(activeMissingKeys)}
                  disabled={activeMissingKeys.length === 0}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground h-7 rounded-full px-3 text-xs font-semibold"
                  onClick={() => setSelectedMissingKeys([])}
                  disabled={activeMissingKeys.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="border-border/70 bg-card/80 rounded-2xl border p-3">
              <div className="flex items-center gap-2">
                <span className="bg-muted text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold">
                  3
                </span>
                <p className="muted-label">Overwrite existing</p>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                If a key was deleted but still reserved, overwrite will restore
                it.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Checkbox
                  checked={overwriteExisting}
                  onCheckedChange={(value) =>
                    setOverwriteExisting(Boolean(value))
                  }
                />
                Overwrite existing keys
              </label>
            </div>
          </div>
        )}
        <DialogFooter className="mt-6">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={
              !missingSourceEnvId ||
              missingCopying ||
              selectedMissingKeys.length === 0
            }
            className="rounded-full"
          >
            {missingCopying ? 'Adding...' : 'Add keys'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
