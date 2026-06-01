import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { EditProjectDialog } from '../components/projects/EditProjectDialog'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { environmentPath } from '../lib/paths'
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
  const [renameOpen, setRenameOpen] = useState(false)
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

  useRegisterShortcut('b', () => navigate('/projects'))

  const renameMutation = useMutation({
    mutationFn: async (name: string) => api.updateProject(projectId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
      setRenameOpen(false)
      toast.success('Project renamed.')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

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
        return true
      } catch (error) {
        toast.error(getErrorMessage(error))
        return false
      }
    },
    [projectId, queryClient],
  )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Environments"
        subtitle={
          <span className="flex items-center gap-2">
            <span>Project: {selectedProject?.name ?? projectId.slice(0, 6)}</span>
            {selectedProject?.role === 'ADMIN' ? (
              <button
                type="button"
                onClick={() => setRenameOpen(true)}
                className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded p-0.5 transition-colors"
                aria-label="Rename project"
              >
                <Pencil className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => navigate('/projects')}
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

      <EditProjectDialog
        open={renameOpen}
        project={selectedProject}
        saving={renameMutation.isPending}
        error={renameMutation.error ? getErrorMessage(renameMutation.error) : null}
        onOpenChange={setRenameOpen}
        onSubmit={async (name) => {
          await renameMutation.mutateAsync(name)
        }}
      />
    </section>
  )
}
