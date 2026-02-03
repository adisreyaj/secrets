import type { ProjectDto } from '@secrets/shared'

const navItems = [
  { key: 'overview', label: 'Overview', path: (id: string) => `/projects/${id}` },
  { key: 'environments', label: 'Environments', path: (id: string) => `/projects/${id}/environments` },
  { key: 'secrets', label: 'Secrets', path: (id: string) => `/projects/${id}/environments` },
  { key: 'audit', label: 'Audit log', path: (id: string) => `/projects/${id}/audit` },
  { key: 'tokens', label: 'API tokens', path: (id: string) => `/projects/${id}/tokens` },
]

export const Sidebar = ({
  project,
  environmentCount,
  secretCount,
  projectId,
  active,
  onNavigate,
}: {
  project: ProjectDto | null
  environmentCount: number
  secretCount: number
  projectId: string
  active: 'overview' | 'environments' | 'audit' | 'tokens' | 'secrets'
  onNavigate: (path: string) => void
}) => (
  <aside className="space-y-4 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-soft">
    <header>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Workspace</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">
        {project?.name ?? 'No project'}
      </p>
      <p className="text-xs text-slate-500">
        {project ? (
          <>
            Updated{' '}
            <time dateTime={project.updatedAt}>
              {new Date(project.updatedAt).toLocaleDateString()}
            </time>
          </>
        ) : (
          'Select a project'
        )}
      </p>
    </header>
    <nav aria-label="Project sections">
      <ul className="space-y-3 text-sm text-slate-600">
        {navItems.map((item) => {
          const isActive = item.key === active
          return (
            <li key={item.key}>
              <button
                onClick={() => onNavigate(item.path(projectId))}
                className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left transition ${
                  isActive ? 'bg-slate-900 text-white' : 'hover:bg-white'
                }`}
              >
                <span>{item.label}</span>
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                  →
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
    <section className="rounded-2xl bg-slate-900 p-4 text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-white/70">Coverage</p>
      <p className="mt-2 text-lg font-semibold">{secretCount}</p>
      <p className="text-xs text-white/70">
        {environmentCount} environments with secrets
      </p>
    </section>
  </aside>
)
