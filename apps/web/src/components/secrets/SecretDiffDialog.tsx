import type { SecretDiffResponse, SecretDto, SecretVersionDto } from '@secrets/shared'
import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../../lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

export const SecretDiffDialog = ({
  open,
  secret,
  onClose,
  onDiff,
  onListVersions,
}: {
  open: boolean
  secret: SecretDto | null
  onClose: () => void
  onDiff: (
    secretId: string,
    versions?: { from?: string; to?: string },
  ) => Promise<SecretDiffResponse>
  onListVersions: (secretId: string) => Promise<SecretVersionDto[]>
}) => {
  const [loading, setLoading] = useState(false)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<SecretDiffResponse | null>(null)
  const [versions, setVersions] = useState<SecretVersionDto[]>([])
  const [fromVersionId, setFromVersionId] = useState<string>('')
  const [toVersionId, setToVersionId] = useState<string>('')

  useEffect(() => {
    if (!open || !secret) {
      setLoading(false)
      setVersionsLoading(false)
      setError(null)
      setDiffData(null)
      setVersions([])
      setFromVersionId('')
      setToVersionId('')
      return
    }

    let cancelled = false
    setVersionsLoading(true)
    setError(null)
    setDiffData(null)

    onListVersions(secret.id)
      .then((data) => {
        if (cancelled) return
        setVersions(data)
        const latest = data[0]
        const previous = data[1]
        setToVersionId(latest?.id ?? '')
        setFromVersionId(previous?.id ?? '')
      })
      .catch((error) => {
        if (cancelled) return
        setError(
          error instanceof Error ? error.message : 'Unable to load versions.',
        )
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, onListVersions, secret])

  useEffect(() => {
    if (!open || !secret) return
    if (!fromVersionId || !toVersionId) return
    if (fromVersionId === toVersionId) {
      setError('Select two different versions to compare.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDiffData(null)

    onDiff(secret.id, { from: fromVersionId, to: toVersionId })
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
  }, [fromVersionId, onDiff, open, secret, toVersionId])

  const versionOptions = useMemo(
    () =>
      versions.map((version) => ({
        id: version.id,
        label: `${version.id.slice(0, 6)} · ${formatDateTime(version.createdAt)}${
          version.isActive ? ' (current)' : ''
        }`,
      })),
    [versions],
  )

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
            Compare any two versions of this secret.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
              From
            </p>
            <Select
              value={fromVersionId}
              onValueChange={(value) => setFromVersionId(value)}
              disabled={versionsLoading || versions.length < 2}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versionOptions.map((version) => (
                  <SelectItem
                    key={`from-${version.id}`}
                    value={version.id}
                    disabled={version.id === toVersionId}
                  >
                    {version.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
              To
            </p>
            <Select
              value={toVersionId}
              onValueChange={(value) => setToVersionId(value)}
              disabled={versionsLoading || versions.length < 2}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versionOptions.map((version) => (
                  <SelectItem
                    key={`to-${version.id}`}
                    value={version.id}
                    disabled={version.id === fromVersionId}
                  >
                    {version.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {versionsLoading ? (
          <p className="text-muted-foreground text-sm">Loading versions...</p>
        ) : versions.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Not enough versions to compare yet.
          </p>
        ) : loading ? (
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
