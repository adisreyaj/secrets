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
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm">
      {loading ? (
        <p className="text-muted-foreground">Checking coverage across environments…</p>
      ) : missingKeys.length > 0 ? (
        <div className="space-y-2 text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">Missing in this environment</p>
              <p className="text-xs text-muted-foreground">
                These keys exist in other environments but not here.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
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
              <span className="rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground">
                +{missingOverflow} more
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">All environments share the same keys.</p>
      )}
    </div>
  )
}
