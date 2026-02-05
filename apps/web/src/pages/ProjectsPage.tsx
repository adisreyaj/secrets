import type { ProjectDto } from '@secrets/shared'
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import {
  ProjectsSection,
  type ProjectTemplate,
} from '../components/ProjectsSection'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ProjectsPage = ({
  navigate,
}: {
  navigate: (path: string) => void
}) => {
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
  const projects = projectsData ?? []
  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null

  const createProjectMutation = useMutation({
    mutationFn: async (payload: { name: string; template: ProjectTemplate }) => {
      const project = await api.createProject({ name: payload.name })
      const templates: Record<ProjectTemplate, string[]> = {
        starter: ['development', 'prod'],
        full: ['development', 'staging', 'prod'],
        empty: [],
      }

      const environments = templates[payload.template] ?? []
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
    async (payload: { name: string; template: ProjectTemplate }) => {
      await createProjectMutation.mutateAsync(payload)
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
