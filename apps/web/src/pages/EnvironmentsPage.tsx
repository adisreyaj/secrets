import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { environmentPath, projectPath } from '../lib/paths'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const EnvironmentsPage = ({
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
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const {
    data: environmentsData,
    loading: envLoading,
    error: envError,
    reload: loadEnvironments,
  } = useAsyncResource<EnvironmentDto[]>(
    async () => (user ? api.listEnvironments(projectId) : []),
    [projectId, user],
  )
  const environments = environmentsData ?? []

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  const handleCreateEnvironment = useCallback(
    async (payload: {
      name: string
      copyFromEnvironmentId?: string | null
    }) => {
      await api.createEnvironment(projectId, {
        name: payload.name,
        copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
      })
      await loadEnvironments()
    },
    [projectId, loadEnvironments],
  )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Environments"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() =>
              navigate(projectPath(projectId, selectedProject?.slug))
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || envError) && (
        <ErrorBanner message={(projectsError || envError) as string} />
      )}

      <EnvironmentsSection
        environments={environments}
        selectedEnvironmentId={null}
        loading={envLoading}
        error={envError}
        missingCounts={{}}
        coverageLoading={false}
        onSelect={(envId) =>
          navigate(
            environmentPath(
              projectId,
              selectedProject?.slug,
              envId,
              environments.find((env) => env.id === envId)?.slug,
            ),
          )
        }
        onCreate={handleCreateEnvironment}
      />
    </section>
  )
}
