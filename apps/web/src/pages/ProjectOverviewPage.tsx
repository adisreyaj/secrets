import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Box,
  ClipboardList,
  KeyRound,
  ScrollText,
} from 'lucide-react'
import { useMemo } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import {
  auditPath,
  environmentsPath,
  tokensPath,
} from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRequireAuth } from '../lib/useRequireAuth'

type ProjectOverviewPageProps = {
  projectId: string
  navigate: (path: string) => void
}

export const ProjectOverviewPage = ({
  projectId,
  navigate,
}: ProjectOverviewPageProps) => {
  const { user } = useRequireAuth(navigate)
  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const {
    data: environmentsData,
    isLoading: envLoading,
    error: envErrorRaw,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const projects = asArray(projectsData)
  const environments = asArray(environmentsData)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  const projectError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null
  const envError = envErrorRaw ? getErrorMessage(envErrorRaw) : null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedProject?.name ?? 'Project overview'}
        subtitle={
          selectedProject
            ? `Your role: ${selectedProject.role ?? 'Member'} · Updated ${formatDate(selectedProject.updatedAt)}`
            : 'Loading project…'
        }
        actions={
          <Button
            variant="outline"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Button>
        }
      />

      {(projectError || envError) && (
        <ErrorBanner message={projectError || envError} />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Box className="h-4 w-4" />}
          label="Environments"
          value={envLoading ? '…' : environments.length}
          actionLabel="Manage environments"
          onAction={() => navigate(environmentsPath(projectId))}
        />
        <SummaryCard
          icon={<KeyRound className="h-4 w-4" />}
          label="API tokens"
          value="—"
          actionLabel="Manage tokens"
          onAction={() => navigate(tokensPath(projectId))}
        />
        <SummaryCard
          icon={<ScrollText className="h-4 w-4" />}
          label="Audit log"
          value="—"
          actionLabel="Open audit"
          onAction={() => navigate(auditPath(projectId))}
        />
      </div>

      <SectionCard>
        <SectionHeader
          kicker="Environments"
          title="Available environments in this project"
          action={
            <Button
              variant="outline"
              onClick={() => navigate(environmentsPath(projectId))}
            >
              <Box className="h-4 w-4" />
              View all
            </Button>
          }
        />
        {envLoading ? (
          <p className="text-muted-foreground mt-6 text-sm">Loading…</p>
        ) : environments.length === 0 ? (
          <p className="text-muted-foreground mt-6 text-sm">
            No environments yet. Open the environments page to create one.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {environments.slice(0, 6).map((env) => (
              <li
                key={env.id}
                className="border-border/70 bg-background/40 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
              >
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {env.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Updated {formatDate(env.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(environmentsPath(projectId, selectedProject?.slug))
                  }
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <SectionHeader
          kicker="Shortcuts"
          title="Jump to a project area"
        />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <ShortcutButton
            label="Environments"
            description="Create and manage environments for this project."
            onClick={() => navigate(environmentsPath(projectId))}
          />
          <ShortcutButton
            label="API tokens"
            description="Create, rotate, and revoke project API tokens."
            onClick={() => navigate(tokensPath(projectId))}
          />
          <ShortcutButton
            label="Audit log"
            description="Review recent activity and configure retention."
            onClick={() => navigate(auditPath(projectId))}
          />
        </div>
      </SectionCard>
    </section>
  )
}

const SummaryCard = ({
  icon,
  label,
  value,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  actionLabel: string
  onAction: () => void
}) => (
  <SectionCard>
    <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
    <p className="mt-3 text-3xl font-semibold">{value}</p>
    <Button
      variant="link"
      className="px-0"
      onClick={onAction}
    >
      <ClipboardList className="h-4 w-4" />
      {actionLabel}
    </Button>
  </SectionCard>
)

const ShortcutButton = ({
  label,
  description,
  onClick,
}: {
  label: string
  description: string
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className="border-border/70 bg-background/40 hover:border-foreground/40 hover:bg-background/70 rounded-2xl border p-4 text-left transition-colors"
  >
    <p className="text-foreground text-sm font-semibold">{label}</p>
    <p className="text-muted-foreground mt-1 text-xs">{description}</p>
  </button>
)
