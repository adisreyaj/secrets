import type { ProjectDto } from '@secrets/shared'
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { ProjectsSection } from '../components/ProjectsSection'
import { PROJECT_TEMPLATE_ENVIRONMENTS } from '../features/projects/constants'
import type { CreateProjectPayload } from '../features/projects/types'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRequireAuth } from '../lib/useRequireAuth'

type ProjectsPageProps = {
  navigate: (path: string) => void
}

export const ProjectsPage = ({ navigate }: ProjectsPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsErrorRaw,
  } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const projects = asArray(projectsData)
  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null

  const createProjectMutation = useMutation({
    mutationFn: async (payload: CreateProjectPayload) => {
      const project = await api.createProject({ name: payload.name })
      const environments = PROJECT_TEMPLATE_ENVIRONMENTS[payload.template] ?? []

      if (environments.length > 0) {
        await Promise.all(
          environments.map((envName) =>
            api.createEnvironment(project.id, { name: envName }),
          ),
        )
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })

  const handleCreate = useCallback(
    async (payload: CreateProjectPayload) => {
      const created = await runMutationWithToast(
        () => createProjectMutation.mutateAsync(payload),
        { successMessage: 'Project created.' },
      )
      return Boolean(created)
    },
    [createProjectMutation],
  )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        subtitle="Pick a workspace or create a new one."
      />

      <ProjectsSection
        projects={projects}
        selectedProjectId={null}
        loading={projectsLoading}
        error={projectsError}
        onSelect={(projectId) => {
          const project = projects.find((item) => item.id === projectId)
          navigate(projectPath(projectId, project?.slug))
        }}
        onCreate={handleCreate}
      />
    </section>
  )
}
