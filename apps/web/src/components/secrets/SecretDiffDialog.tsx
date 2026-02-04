import type { SecretDiffResponse, SecretDto } from '@secrets/shared'
import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../../lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

export const SecretDiffDialog = ({
  open,
  secret,
  onClose,
  onDiff,
}: {
  open: boolean
  secret: SecretDto | null
  onClose: () => void
  onDiff: (secretId: string) => Promise<SecretDiffResponse>
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<SecretDiffResponse | null>(null)

  useEffect(() => {
    if (!open || !secret) {
      setLoading(false)
      setError(null)
      setDiffData(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDiffData(null)

    onDiff(secret.id)
      .then((data) => {
        if (!cancelled) setDiffData(data)
      })
      .catch((error) => {
        if (cancelled) return
        setError(error instanceof Error ? error.message : 'Unable to load diff.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, onDiff, secret])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Secret diff</DialogTitle>
          <DialogDescription>
            Compare the latest value with the previous version.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading diff...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : diffData ? (
          <DiffViewer diff={diffData} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

const DiffViewer = ({ diff }: { diff: SecretDiffResponse }) => {
  const rows = useMemo(() => {
    const previousLines = diff.previous.value.split(/\r?\n/)
    const currentLines = diff.current.value.split(/\r?\n/)
    const max = Math.max(previousLines.length, currentLines.length)
    return Array.from({ length: max }, (_, index) => {
      const prev = previousLines[index] ?? ''
      const curr = currentLines[index] ?? ''
      const status =
        prev === curr
          ? 'same'
          : prev && !curr
            ? 'removed'
            : !prev && curr
              ? 'added'
              : 'changed'
      return { prev, curr, status, index }
    })
  }, [diff])

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border-border bg-muted/40 rounded-2xl border p-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Previous
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Version {diff.previous.versionId.slice(0, 6)} ·{' '}
          {formatDateTime(diff.previous.createdAt)}
        </p>
        <div className="mt-3 space-y-1">
          {rows.map((row) => (
            <div
              key={`prev-${row.index}`}
              className={`text-foreground rounded-lg px-2 py-1 text-xs ${
                row.status === 'removed' || row.status === 'changed'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-background'
              }`}
            >
              <span className="text-muted-foreground mr-2 inline-block w-4 text-right text-[10px]">
                {row.index + 1}
              </span>
              {row.prev}
            </div>
          ))}
        </div>
      </div>
      <div className="border-border bg-muted/40 rounded-2xl border p-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Current
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Version {diff.current.versionId.slice(0, 6)} ·{' '}
          {formatDateTime(diff.current.createdAt)}
        </p>
        <div className="mt-3 space-y-1">
          {rows.map((row) => (
            <div
              key={`curr-${row.index}`}
              className={`text-foreground rounded-lg px-2 py-1 text-xs ${
                row.status === 'added' || row.status === 'changed'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-background'
              }`}
            >
              <span className="text-muted-foreground mr-2 inline-block w-4 text-right text-[10px]">
                {row.index + 1}
              </span>
              {row.curr}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
