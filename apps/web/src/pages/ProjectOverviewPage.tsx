import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle,
  Key,
  KeyRound,
  Layers,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { useFlagEnabled } from '../lib/feature-flags'
import { FEATURE_FLAGS } from '../lib/feature-flags/keys'
import { environmentsPath, projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ProjectOverviewPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const { data: environmentsData, error: envErrorRaw } =
    useQuery<EnvironmentDto[]>({
      queryKey: queryKeys.environments(projectId),
      queryFn: () => api.listEnvironments(projectId),
      enabled: Boolean(user) && Boolean(projectId),
  })
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const environments = environmentsData ?? []
  const environmentsEnabled = useFlagEnabled(
    FEATURE_FLAGS.ENVIRONMENTS_ALLOW,
    true,
  )
  const auditEnabled = useFlagEnabled(FEATURE_FLAGS.AUDIT_ALLOW, true)
  const tokensEnabled = useFlagEnabled(FEATURE_FLAGS.TOKENS_ALLOW, true)
  const serviceAccountsEnabled = useFlagEnabled(
    FEATURE_FLAGS.SERVICE_ACCOUNTS_ALLOW,
    true,
  )
  const teamEnabled = useFlagEnabled(FEATURE_FLAGS.TEAM_ALLOW, true)
  const approvalsEnabled = useFlagEnabled(FEATURE_FLAGS.APPROVALS_ALLOW, true)
  const approvalRulesEnabled = useFlagEnabled(
    FEATURE_FLAGS.APPROVAL_RULES_ALLOW,
    true,
  )

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  useRegisterShortcut(
    'e',
    () => navigate(environmentsPath(projectId, selectedProject?.slug)),
    { enabled: environmentsEnabled },
  )
  useRegisterShortcut(
    'l',
    () => navigate(projectPath(projectId, selectedProject?.slug, 'audit')),
    { enabled: auditEnabled },
  )
  useRegisterShortcut(
    'a',
    () => navigate(projectPath(projectId, selectedProject?.slug, 'approvals')),
    { enabled: approvalsEnabled },
  )
  useRegisterShortcut(
    'r',
    () =>
      navigate(projectPath(projectId, selectedProject?.slug, 'approval-rules')),
    { enabled: approvalRulesEnabled },
  )
  useRegisterShortcut(
    'm',
    () => navigate(projectPath(projectId, selectedProject?.slug, 'team')),
    { enabled: teamEnabled },
  )
  useRegisterShortcut(
    't',
    () => navigate(projectPath(projectId, selectedProject?.slug, 'tokens')),
    { enabled: tokensEnabled },
  )
  useRegisterShortcut(
    's',
    () =>
      navigate(
        projectPath(projectId, selectedProject?.slug, 'service-accounts'),
      ),
    { enabled: serviceAccountsEnabled },
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
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsErrorRaw || envErrorRaw) && (
        <ErrorBanner
          message={getErrorMessage(projectsErrorRaw ?? envErrorRaw)}
        />
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {environmentsEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() =>
                navigate(environmentsPath(projectId, selectedProject?.slug))
              }
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
        ) : null}
        {auditEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() =>
                navigate(projectPath(projectId, selectedProject?.slug, 'audit'))
              }
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
        ) : null}
        {tokensEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() =>
                navigate(projectPath(projectId, selectedProject?.slug, 'tokens'))
              }
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
        ) : null}
        {serviceAccountsEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  projectPath(
                    projectId,
                    selectedProject?.slug,
                    'service-accounts',
                  ),
                )
              }
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
        ) : null}
        {teamEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() => {
                navigate(projectPath(projectId, selectedProject?.slug, 'team'))
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
        ) : null}
        {approvalsEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  projectPath(projectId, selectedProject?.slug, 'approvals'),
                )
              }
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
        ) : null}
        {approvalRulesEnabled ? (
          <li>
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  projectPath(
                    projectId,
                    selectedProject?.slug,
                    'approval-rules',
                  ),
                )
              }
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
        ) : null}
      </ul>
    </section>
  )
}
