import type { DotenvEntry } from '../../lib/parseDotenv'

export const ImportPreviewList = ({
  entries,
  conflictKeys,
  duplicateKeys,
  invalidLines,
}: {
  entries: DotenvEntry[]
  conflictKeys: Set<string>
  duplicateKeys: string[]
  invalidLines: { line: number; text: string }[]
}) => {
  return (
    <div className="grid gap-2">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span className="text-foreground font-semibold">
          {entries.length} keys
        </span>
        <span>·</span>
        <span>{conflictKeys.size} conflicts</span>
        {duplicateKeys.length > 0 ? (
          <>
            <span>·</span>
            <span>{duplicateKeys.length} duplicates</span>
          </>
        ) : null}
        {invalidLines.length > 0 ? (
          <>
            <span>·</span>
            <span>{invalidLines.length} invalid</span>
          </>
        ) : null}
      </div>
      <div className="border-border bg-card/70 max-h-56 overflow-auto rounded-2xl border">
        <div className="grid gap-1 p-3 text-xs">
          {entries.map((entry) => {
            const hasConflict = conflictKeys.has(entry.key)
            return (
              <div
                key={`${entry.key}-${entry.line}`}
                className="hover:border-border/60 flex items-center justify-between gap-3 rounded-xl border border-transparent px-2 py-1"
              >
                <span className="text-foreground font-semibold">
                  {entry.key}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em] uppercase ${
                    hasConflict
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {hasConflict ? 'Conflict' : 'New'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {duplicateKeys.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Duplicate keys detected. The last value in the file will be used.
        </p>
      ) : null}
    </div>
  )
}
