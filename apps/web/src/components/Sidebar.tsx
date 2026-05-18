import type { ProjectDto } from '@secrets/shared'
import {
  ChevronRight,
  Key,
  KeyRound,
  LayoutDashboard,
  Layers,
  ShieldCheck,
} from 'lucide-react'
import { Button } from './ui/button'
import { formatDate } from '../lib/format'
import { projectPath } from '../lib/paths'

const navItems: {
  key: 'overview' | 'environments' | 'secrets' | 'audit' | 'tokens'
  label: string
  icon: typeof LayoutDashboard
  path: (id: string, slug?: string | null) => string
}[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    path: (id: string, slug?: string | null) => projectPath(id, slug),
  },
  {
    key: 'environments',
    label: 'Environments',
    icon: Layers,
    path: (id: string, slug?: string | null) =>
      projectPath(id, slug, 'environments'),
  },
  {
    key: 'secrets',
    label: 'Secrets',
    icon: Key,
    path: (id: string, slug?: string | null) =>
      projectPath(id, slug, 'environments'),
  },
  {
    key: 'audit',
    label: 'Audit log',
    icon: ShieldCheck,
    path: (id: string, slug?: string | null) =>
      projectPath(id, slug, 'audit'),
  },
  {
    key: 'tokens',
    label: 'API tokens',
    icon: KeyRound,
    path: (id: string, slug?: string | null) =>
      projectPath(id, slug, 'tokens'),
  },
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
  <aside className="border-border/60 bg-card/70 shadow-soft space-y-4 rounded-3xl border p-6">
    <header>
      <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase">
        Workspace
      </p>
      <p className="text-foreground mt-2 text-lg font-semibold">
        {project?.name ?? 'No project'}
      </p>
      <p className="text-muted-foreground text-xs">
        {project ? (
          <>
            Updated{' '}
            <time dateTime={project.updatedAt}>
              {formatDate(project.updatedAt)}
            </time>
          </>
        ) : (
          'Select a project'
        )}
      </p>
    </header>
    <nav aria-label="Project sections">
      <ul className="text-muted-foreground space-y-3 text-sm">
        {navItems.map((item) => {
          const isActive = item.key === active
          return (
            <li key={item.key}>
              <Button
                variant="ghost"
                onClick={() => onNavigate(item.path(projectId, project?.slug))}
                className={`flex h-auto w-full items-center justify-between rounded-full px-3 py-2 text-left transition ${
                  isActive
                    ? 'bg-foreground text-background hover:bg-foreground'
                    : 'hover:bg-accent'
                }`}
              >
                <span className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
                <ChevronRight
                  className={`h-4 w-4 ${isActive ? 'text-background/70' : 'text-muted-foreground'}`}
                />
              </Button>
            </li>
          )
        })}
      </ul>
    </nav>
    <section className="bg-foreground text-background rounded-2xl p-4">
      <p className="text-background/70 text-xs tracking-[0.3em] uppercase">
        Coverage
      </p>
      <p className="mt-2 text-lg font-semibold">{secretCount}</p>
      <p className="text-background/70 text-xs">
        {environmentCount} environments with secrets
      </p>
    </section>
  </aside>
)
