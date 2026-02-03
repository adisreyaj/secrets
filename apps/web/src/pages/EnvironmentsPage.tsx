import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { PageHeader } from '../components/PageHeader'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const EnvironmentsPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  const loadProjects = useCallback(async () => {
    setProjectsError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    }
  }, [])

  const loadEnvironments = useCallback(async () => {
    setEnvLoading(true)
    setEnvError(null)
    try {
      const data = await api.listEnvironments(projectId)
      setEnvironments(data)
    } catch (error) {
      setEnvError(getErrorMessage(error))
    } finally {
      setEnvLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
    }
  }, [user, loadProjects, loadEnvironments])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  const handleCreateEnvironment = async (name: string) => {
    await api.createEnvironment(projectId, { name })
    await loadEnvironments()
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Environments"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            Back to overview
          </button>
        }
      />

      {(projectsError || envError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError}
        </div>
      )}

      <EnvironmentsSection
        environments={environments}
        selectedEnvironmentId={null}
        loading={envLoading}
        error={envError}
        onSelect={(envId) => navigate(`/projects/${projectId}/environments/${envId}`)}
        onCreate={handleCreateEnvironment}
      />
    </section>
  )
}
