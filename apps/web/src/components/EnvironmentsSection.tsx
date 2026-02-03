import type { EnvironmentDto } from '@secrets/shared'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'
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
  }) => Promise<void>
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      await onCreate({
        name: trimmedName,
        copyFromEnvironmentId: copyFromId !== 'none' ? copyFromId : undefined,
      })
      setDialogOpen(false)
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
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-full border-border px-4 text-sm font-semibold text-foreground hover:border-foreground/40"
              >
                <Plus className="h-4 w-4" />
                New environment
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border-border/70 bg-popover text-popover-foreground">
              <DialogHeader className="text-left">
                <DialogTitle>Create environment</DialogTitle>
                <DialogDescription>
                  Spin up a new environment and optionally duplicate keys from
                  an existing one.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                    Environment name
                  </span>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. staging"
                    className="h-11 rounded-2xl bg-background px-4"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                    Copy keys from
                  </span>
                  <Select
                    value={copyFromId}
                    onValueChange={setCopyFromId}
                    disabled={environmentOptions.length === 0}
                  >
                    <SelectTrigger className="h-11 px-4">
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
                  <span className="text-xs text-muted-foreground">
                    Copies keys (and current values) into the new environment.
                  </span>
                </label>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full px-4 text-sm"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:bg-foreground/90"
                    disabled={creating || !name.trim()}
                  >
                    {creating ? 'Creating...' : 'Create environment'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <ul className="mt-5 space-y-3">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Loading environments...
          </li>
        ) : environments.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Create your first environment.
          </li>
        ) : (
          environments.map((env) => {
            const isSelected = env.id === selectedEnvironmentId
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
                        isSelected ? 'text-background/70' : 'text-muted-foreground'
                      }`}
                    >
                      Updated{' '}
                      <time dateTime={env.updatedAt}>
                        {formatDateTime(env.updatedAt)}
                      </time>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
                            ? 'bg-amber-400/20 text-background'
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
                            ? 'bg-emerald-400/20 text-background'
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
