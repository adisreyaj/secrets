import type { ProjectDto } from '@secrets/shared'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { ProjectsSection } from '../components/ProjectsSection'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ProjectsPage = ({
  navigate,
}: {
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      void loadProjects()
    }
  }, [user, loadProjects])

  const handleCreate = async (name: string) => {
    await api.createProject({ name })
    await loadProjects()
  }

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
