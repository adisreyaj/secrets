import type { ProjectDto } from '@secrets/shared'
import { useCallback } from 'react'
import { PageHeader } from '../components/PageHeader'
import {
  ProjectsSection,
  type ProjectTemplate,
} from '../components/ProjectsSection'
import { api } from '../lib/api'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ProjectsPage = ({
  navigate,
}: {
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
    reload: loadProjects,
  } = useAsyncResource<ProjectDto[]>(
    async () => (user ? api.listProjects() : []),
    [user],
  )
  const projects = projectsData ?? []

  const handleCreate = useCallback(
    async (payload: { name: string; template: ProjectTemplate }) => {
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
      await loadProjects()
    },
    [loadProjects],
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
        onSelect={(projectId) => navigate(`/projects/${projectId}`)}
        onCreate={handleCreate}
      />
    </section>
  )
}
