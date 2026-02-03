import type { ProjectDto } from '@secrets/shared'
import { useState } from 'react'
import { formatShortDate } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'

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
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New project name"
              className="h-9 rounded-full border border-slate-200 px-4 text-sm text-slate-700 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              {creating ? 'Creating...' : 'New project'}
            </button>
          </form>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
            Loading projects...
          </li>
        ) : projects.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
            No projects yet. Create one to get started.
          </li>
        ) : (
          projects.map((project) => {
            const isSelected = project.id === selectedProjectId
            return (
              <li key={project.id}>
                <button
                  onClick={() => onSelect(project.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-1 hover:shadow-lg ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200/80 bg-white text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em]">
                    <time
                      className={isSelected ? 'text-white/70' : 'text-slate-500'}
                      dateTime={project.updatedAt}
                    >
                      {formatShortDate(project.updatedAt)}
                    </time>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {project.role ?? 'Member'}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{project.name}</h3>
                  <p className={`mt-2 text-xs ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                    Project ID: {project.id.slice(0, 6)}
                  </p>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </SectionCard>
  )
}
