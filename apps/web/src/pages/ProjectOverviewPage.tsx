import { useMemo } from 'react'
import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import {
  ArrowLeft,
  Layers,
  ShieldCheck,
  KeyRound,
  Users,
  Shield,
  CheckCircle,
  Key,
} from 'lucide-react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ProjectOverviewPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const { data: projectsData, error: projectsError } = useAsyncResource<
    ProjectDto[]
  >(async () => (user ? api.listProjects() : []), [user])
  const { data: environmentsData, error: envError } = useAsyncResource<
    EnvironmentDto[]
  >(
    async () => (user ? api.listEnvironments(projectId) : []),
    [projectId, user],
  )
  const projects = projectsData ?? []
  const environments = environmentsData ?? []

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  useRegisterShortcut('e', () =>
    navigate(`/projects/${projectId}/environments`),
  )
  useRegisterShortcut('l', () => navigate(`/projects/${projectId}/audit`))
  useRegisterShortcut('a', () => navigate(`/projects/${projectId}/approvals`))
  useRegisterShortcut('r', () =>
    navigate(`/projects/${projectId}/approval-rules`),
  )
  useRegisterShortcut('m', () => navigate(`/projects/${projectId}/team`))
  useRegisterShortcut('t', () => navigate(`/projects/${projectId}/tokens`))
  useRegisterShortcut('s', () =>
    navigate(`/projects/${projectId}/service-accounts`),
  )
  useRegisterShortcut('b', () => navigate('/projects'))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedProject?.name ?? 'Project'}
        subtitle="Choose a section to continue."
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || envError) && (
        <ErrorBanner message={projectsError || envError} />
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/environments`)}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <Layers className="text-muted-foreground h-4 w-4" />
                  Environments
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {environments.length} environments
                </p>
              </div>
              <ShortcutHint keys="e" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/audit`)}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="text-muted-foreground h-4 w-4" />
                  Audit log
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Review changes
                </p>
              </div>
              <ShortcutHint keys="l" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/tokens`)}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="text-muted-foreground h-4 w-4" />
                  API tokens
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Create access keys
                </p>
              </div>
              <ShortcutHint keys="t" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/service-accounts`)}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <Key className="text-muted-foreground h-4 w-4" />
                  Service accounts
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Scoped machine access
                </p>
              </div>
              <ShortcutHint keys="s" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => {
              navigate(`/projects/${projectId}/team`)
            }}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <Users className="text-muted-foreground h-4 w-4" />
                  Team
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Members and invites
                </p>
              </div>
              <ShortcutHint keys="m" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/approvals`)}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle className="text-muted-foreground h-4 w-4" />
                  Approvals
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Review pending changes
                </p>
              </div>
              <ShortcutHint keys="a" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/approval-rules`)}
            className="border-border bg-card shadow-soft hover:border-foreground/30 h-auto w-full flex-col items-start justify-start rounded-2xl p-5 text-left whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <Shield className="text-muted-foreground h-4 w-4" />
                  Approval rules
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Configure approvals
                </p>
              </div>
              <ShortcutHint keys="r" />
            </div>
          </Button>
        </li>
      </ul>
    </section>
  )
}
