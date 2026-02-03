import type { ProjectDto } from '@secrets/shared'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { formatShortDate } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'

export const ProjectsSection = ({
  projects,
  selectedProjectId,
  loading,
  error,
  onSelect,
  onCreate,
}: {
  projects: ProjectDto[]
  selectedProjectId: string | null
  loading: boolean
  error: string | null
  onSelect: (projectId: string) => void
  onCreate: (name: string) => Promise<void>
}) => {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(name.trim())
      setName('')
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
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New project name"
              className="w-[220px] rounded-full bg-background"
            />
            <Button
              type="submit"
              variant="outline"
              className="gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Creating...' : 'New project'}
            </Button>
          </form>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-border bg-card/70 p-6 text-sm text-muted-foreground">
            Loading projects...
          </li>
        ) : projects.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border bg-card/70 p-6 text-sm text-muted-foreground">
            No projects yet. Create one to get started.
          </li>
        ) : (
          projects.map((project) => {
            const isSelected = project.id === selectedProjectId
            return (
              <li key={project.id}>
                <Button
                  onClick={() => onSelect(project.id)}
                  variant="ghost"
                  className={`h-auto w-full flex-col items-start justify-start gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-1 hover:shadow-lg whitespace-normal ${
                    isSelected
                      ? 'border-foreground bg-foreground text-background hover:bg-foreground'
                      : 'border-border bg-card text-card-foreground hover:bg-card'
                  }`}
                >
                  <div className="flex w-full items-center justify-between text-xs uppercase tracking-[0.2em]">
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
                  <h3 className="mt-3 text-lg font-semibold">{project.name}</h3>
                  <p
                    className={`mt-2 text-xs ${
                      isSelected ? 'text-background/70' : 'text-muted-foreground'
                    }`}
                  >
                    Project ID: {project.id.slice(0, 6)}
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
