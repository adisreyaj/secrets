import { Button } from '../ui/button'

export const MissingKeysCard = ({
  loading,
  missingKeys,
  missingSourcesCount,
  onOpenDialog,
}: {
  loading: boolean
  missingKeys: string[]
  missingSourcesCount: number
  onOpenDialog: () => void
}) => {
  const missingPreview = missingKeys.slice(0, 6)
  const missingOverflow = missingKeys.length - missingPreview.length

  return (
    <div className="border-border bg-card/70 mt-4 rounded-2xl border border-dashed p-4 text-sm">
      {loading ? (
        <p className="text-muted-foreground">
          Checking coverage across environments…
        </p>
      ) : missingKeys.length > 0 ? (
        <div className="text-muted-foreground space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-foreground font-semibold">
                Missing in this environment
              </p>
              <p className="text-muted-foreground text-xs">
                These keys exist in other environments but not here.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenDialog}
              disabled={missingSourcesCount === 0}
            >
              Add missing keys
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {missingPreview.map((key) => (
              <span
                key={key}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700"
              >
                {key}
              </span>
            ))}
            {missingOverflow > 0 ? (
              <span className="border-border bg-muted text-muted-foreground rounded-full border px-3 py-1">
                +{missingOverflow} more
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">
          All environments share the same keys.
        </p>
      )}
    </div>
  )
}
