import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { environmentPath, projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

export const EnvironmentsPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const {
    data: environmentsData,
    isLoading: envLoading,
    error: envErrorRaw,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
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
      try {
        await api.createEnvironment(projectId, {
          name: payload.name,
          copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
        })
        await queryClient.invalidateQueries({
          queryKey: queryKeys.environments(projectId),
        })
        toast.success('Environment created.')
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
    [projectId, queryClient],
  )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Environments"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="flex items-center gap-2"
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

      {(projectsErrorRaw || envErrorRaw) && (
        <ErrorBanner
          message={getErrorMessage(projectsErrorRaw ?? envErrorRaw)}
        />
      )}

      <EnvironmentsSection
        environments={environments}
        selectedEnvironmentId={null}
        loading={envLoading}
        error={envErrorRaw ? getErrorMessage(envErrorRaw) : null}
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
