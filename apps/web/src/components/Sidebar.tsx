import type { ProjectDto } from '@secrets/shared'
import {
  ChevronRight,
  Key,
  KeyRound,
  LayoutDashboard,
  Layers,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from './ui/button'

const navItems: {
  key: 'overview' | 'environments' | 'secrets' | 'audit' | 'approvals' | 'approval-rules' | 'tokens' | 'team'
  label: string
  icon: LucideIcon
  path: (id: string) => string
}[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, path: (id: string) => `/projects/${id}` },
  {
    key: 'environments',
    label: 'Environments',
    icon: Layers,
    path: (id: string) => `/projects/${id}/environments`,
  },
  { key: 'secrets', label: 'Secrets', icon: Key, path: (id: string) => `/projects/${id}/environments` },
  { key: 'audit', label: 'Audit log', icon: ShieldCheck, path: (id: string) => `/projects/${id}/audit` },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck, path: (id: string) => `/projects/${id}/approvals` },
  { key: 'approval-rules', label: 'Approval rules', icon: ShieldCheck, path: (id: string) => `/projects/${id}/approval-rules` },
  { key: 'team', label: 'Team', icon: Users, path: (id: string) => `/projects/${id}/team` },
  { key: 'tokens', label: 'API tokens', icon: KeyRound, path: (id: string) => `/projects/${id}/tokens` },
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
  active: 'overview' | 'environments' | 'audit' | 'approvals' | 'approval-rules' | 'tokens' | 'secrets' | 'team'
  onNavigate: (path: string) => void
}) => (
  <aside className="space-y-4 rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
    <header>
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Workspace
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        {project?.name ?? 'No project'}
      </p>
      <p className="text-xs text-muted-foreground">
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
      <ul className="space-y-3 text-sm text-muted-foreground">
        {navItems.map((item) => {
          const isActive = item.key === active
          return (
            <li key={item.key}>
              <Button
                variant="ghost"
                onClick={() => onNavigate(item.path(projectId))}
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
    <section className="rounded-2xl bg-foreground p-4 text-background">
      <p className="text-xs uppercase tracking-[0.3em] text-background/70">
        Coverage
      </p>
      <p className="mt-2 text-lg font-semibold">{secretCount}</p>
      <p className="text-xs text-background/70">
        {environmentCount} environments with secrets
      </p>
    </section>
  </aside>
)
