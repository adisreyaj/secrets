import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { PageHeader } from '../components/PageHeader'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ProjectOverviewPage = ({
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
    setEnvError(null)
    try {
      const data = await api.listEnvironments(projectId)
      setEnvironments(data)
    } catch (error) {
      setEnvError(getErrorMessage(error))
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

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedProject?.name ?? 'Project'}
        subtitle="Choose a section to continue."
        actions={
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => navigate('/projects')}
          >
            Back to projects
          </button>
        }
      />

      {(projectsError || envError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError}
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        <li>
          <button
            onClick={() => navigate(`/projects/${projectId}/environments`)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-soft hover:border-slate-300"
          >
            <p className="text-sm font-semibold text-slate-900">Environments</p>
            <p className="mt-1 text-xs text-slate-500">{environments.length} environments</p>
          </button>
        </li>
        <li>
          <button
            onClick={() => navigate(`/projects/${projectId}/audit`)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-soft hover:border-slate-300"
          >
            <p className="text-sm font-semibold text-slate-900">Audit log</p>
            <p className="mt-1 text-xs text-slate-500">Review changes</p>
          </button>
        </li>
        <li>
          <button
            onClick={() => navigate(`/projects/${projectId}/tokens`)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-soft hover:border-slate-300"
          >
            <p className="text-sm font-semibold text-slate-900">API tokens</p>
            <p className="mt-1 text-xs text-slate-500">Create access keys</p>
          </button>
        </li>
      </ul>
    </section>
  )
}
