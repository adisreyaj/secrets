import type { ProjectDto } from '@secrets/shared'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PROJECT_TEMPLATE_OPTIONS } from '../features/projects/constants'
import type {
  CreateProjectPayload,
  ProjectTemplate,
} from '../features/projects/types'
import { formatShortDate } from '../lib/format'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRegisterProjectSelectionShortcuts } from '../lib/shortcuts.helpers'
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

type ProjectsSectionProps = {
  projects: ProjectDto[]
  selectedProjectId: string | null
  loading: boolean
  error: string | null
  onSelect: (projectId: string) => void
  onCreate: (payload: CreateProjectPayload) => Promise<void>
}

export const ProjectsSection = ({
  projects,
  selectedProjectId,
  loading,
  error,
  onSelect,
  onCreate,
}: ProjectsSectionProps) => {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [template, setTemplate] = useState<ProjectTemplate>('starter')

  useEffect(() => {
    if (!dialogOpen) {
      setName('')
      setTemplate('starter')
    }
  }, [dialogOpen])

  useRegisterShortcut('n', () => setDialogOpen(true))
  useRegisterProjectSelectionShortcuts((index) => {
    const project = projects[index]
    if (project) {
      onSelect(project.id)
    }
  })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      await onCreate({ name: trimmedName, template })
      setDialogOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <SectionCard>
      <SectionHeader
        kicker="Projects"
        title="Your active workspaces"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" />
                New project
                <ShortcutHint keys="n" />
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
              <DialogHeader className="text-left">
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription>
                  Give your workspace a name and pick a starting environment
                  layout.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="muted-label">Project name</span>
                  <Input
                    data-testid="project-name-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Signalflow"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="muted-label">Environment template</span>
                  <Select
                    value={template}
                    onValueChange={(value) =>
                      setTemplate(value as ProjectTemplate)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_TEMPLATE_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-xs">
                    We&apos;ll pre-create the environments you pick so you can
                    start immediately.
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
                    {creating ? 'Creating...' : 'Create project'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {loading ? (
          <li>
            <EmptyState title="Loading projects..." />
          </li>
        ) : projects.length === 0 ? (
          <li>
            <EmptyState title="No projects yet. Create one to get started." />
          </li>
        ) : (
          projects.map((project, index) => {
            const isSelected = project.id === selectedProjectId
            const shortcutKey = index < 9 ? `${index + 1}` : null
            return (
              <li key={project.id}>
                <Button
                  onClick={() => onSelect(project.id)}
                  variant="ghost"
                  className={`h-auto w-full flex-col items-start justify-start gap-3 rounded-2xl border p-4 text-left whitespace-normal transition-transform hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none motion-reduce:hover:transform-none ${
                    isSelected
                      ? 'border-foreground bg-foreground text-background hover:bg-foreground'
                      : 'border-border bg-card text-card-foreground hover:bg-card'
                  }`}
                >
                  <div className="flex w-full items-center justify-between text-xs tracking-[0.1em] uppercase">
                    <time
                      className={
                        isSelected
                          ? 'text-background/70'
                          : 'text-muted-foreground'
                      }
                      dateTime={project.updatedAt}
                    >
                      {formatShortDate(project.updatedAt)}
                    </time>
                    <div className="flex items-center gap-2">
                      {shortcutKey ? <ShortcutHint keys={shortcutKey} /> : null}
                      <Badge
                        variant={isSelected ? 'default' : 'secondary'}
                        className={`px-2 py-1 text-[10px] font-semibold ${
                          isSelected
                            ? 'bg-background/20 text-background'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {project.role ?? 'Member'}
                      </Badge>
                    </div>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{project.name}</h3>
                  <p
                    className={`mt-2 text-xs ${
                      isSelected ? 'text-background/70' : 'text-foreground/70'
                    }`}
                  >
                    Updated {formatShortDate(project.updatedAt)}
                  </p>
                </Button>
              </li>
            )
          })
        )}
      </ul>
    </SectionCard>
  )
}
