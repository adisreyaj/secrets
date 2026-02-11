import type { EnvironmentDto } from '@secrets/shared'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../lib/format'
import { useRegisterShortcut } from '../lib/shortcuts'
import { EmptyState } from './EmptyState'
import { ErrorBanner } from './ErrorBanner'
import { SectionCard, SectionHeader } from './SectionCard'
import { ShortcutHint } from './ShortcutHint'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

export const EnvironmentsSection = ({
  environments,
  selectedEnvironmentId,
  loading,
  error,
  missingCounts,
  coverageLoading,
  onSelect,
  onCreate,
}: {
  environments: EnvironmentDto[]
  selectedEnvironmentId: string | null
  loading: boolean
  error: string | null
  missingCounts: Record<string, number>
  coverageLoading: boolean
  onSelect: (environmentId: string) => void
  onCreate: (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => Promise<boolean>
}) => {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copyFromId, setCopyFromId] = useState<string>('none')

  const environmentOptions = useMemo(
    () => environments.map((env) => ({ id: env.id, name: env.name })),
    [environments],
  )

  useEffect(() => {
    if (!dialogOpen) {
      setName('')
      setCopyFromId('none')
    }
  }, [dialogOpen])

  useRegisterShortcut('n', () => setDialogOpen(true))
  useRegisterShortcut(
    '1',
    () => environments[0] && onSelect(environments[0].id),
  )
  useRegisterShortcut(
    '2',
    () => environments[1] && onSelect(environments[1].id),
  )
  useRegisterShortcut(
    '3',
    () => environments[2] && onSelect(environments[2].id),
  )
  useRegisterShortcut(
    '4',
    () => environments[3] && onSelect(environments[3].id),
  )
  useRegisterShortcut(
    '5',
    () => environments[4] && onSelect(environments[4].id),
  )
  useRegisterShortcut(
    '6',
    () => environments[5] && onSelect(environments[5].id),
  )
  useRegisterShortcut(
    '7',
    () => environments[6] && onSelect(environments[6].id),
  )
  useRegisterShortcut(
    '8',
    () => environments[7] && onSelect(environments[7].id),
  )
  useRegisterShortcut(
    '9',
    () => environments[8] && onSelect(environments[8].id),
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      const created = await onCreate({
        name: trimmedName,
        copyFromEnvironmentId: copyFromId !== 'none' ? copyFromId : undefined,
      })
      if (created) {
        setDialogOpen(false)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <SectionCard>
      <SectionHeader
        kicker="Environments"
        title="Environment list"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default">
                <Plus className="h-4 w-4" />
                New environment
                <ShortcutHint keys="n" />
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
              <DialogHeader className="text-left">
                <DialogTitle>Create environment</DialogTitle>
                <DialogDescription>
                  Spin up a new environment and optionally duplicate keys from
                  an existing one.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="muted-label">Environment name</span>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. staging"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="muted-label">Copy keys from</span>
                  <Select
                    value={copyFromId}
                    onValueChange={setCopyFromId}
                    disabled={environmentOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Don't copy anything" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Don&apos;t copy anything
                      </SelectItem>
                      {environmentOptions.map((env) => (
                        <SelectItem key={env.id} value={env.id}>
                          {env.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-xs">
                    Copies keys (and current values) into the new environment.
                  </span>
                </label>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !name.trim()}>
                    {creating ? 'Creating...' : 'Create environment'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}
      <ul className="mt-5 space-y-3">
        {loading ? (
          <li>
            <EmptyState title="Loading environments..." />
          </li>
        ) : environments.length === 0 ? (
          <li>
            <EmptyState title="Create your first environment." />
          </li>
        ) : (
          environments.map((env, index) => {
            const isSelected = env.id === selectedEnvironmentId
            const shortcutKey = index < 9 ? `${index + 1}` : null
            return (
              <li key={env.id}>
                <Button
                  onClick={() => onSelect(env.id)}
                  variant="ghost"
                  className={`flex h-auto w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-foreground bg-foreground text-background hover:bg-foreground hover:text-background'
                      : 'border-border bg-card text-card-foreground hover:bg-muted'
                  }`}
                >
                  <div>
                    <p className="font-semibold">{env.name}</p>
                    <p
                      className={`text-xs ${
                        isSelected
                          ? 'text-background/70'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Updated{' '}
                      <time dateTime={env.updatedAt}>
                        {formatDateTime(env.updatedAt)}
                      </time>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {shortcutKey ? <ShortcutHint keys={shortcutKey} /> : null}
                    <Badge
                      variant={isSelected ? 'default' : 'secondary'}
                      className={
                        isSelected
                          ? 'bg-background/20 text-background'
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      {env.id.slice(0, 5)}
                    </Badge>
                    {coverageLoading ? (
                      <Badge
                        variant={isSelected ? 'default' : 'secondary'}
                        className={
                          isSelected
                            ? 'bg-background/20 text-background'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
                        Checking…
                      </Badge>
                    ) : missingCounts[env.id] ? (
                      <Badge
                        variant={isSelected ? 'default' : 'secondary'}
                        className={
                          isSelected
                            ? 'text-background bg-amber-400/20'
                            : 'bg-amber-50 text-amber-700'
                        }
                      >
                        Missing {missingCounts[env.id]}
                      </Badge>
                    ) : (
                      <Badge
                        variant={isSelected ? 'default' : 'secondary'}
                        className={
                          isSelected
                            ? 'text-background bg-emerald-400/20'
                            : 'bg-emerald-50 text-emerald-700'
                        }
                      >
                        Complete
                      </Badge>
                    )}
                  </div>
                </Button>
              </li>
            )
          })
        )}
      </ul>
    </SectionCard>
  )
}
