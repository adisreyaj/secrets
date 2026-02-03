import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnvironmentDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft, Layers, ShieldCheck, KeyRound } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRegisterShortcut } from '../lib/shortcuts'

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

  useRegisterShortcut('e', () => navigate(`/projects/${projectId}/environments`))
  useRegisterShortcut('a', () => navigate(`/projects/${projectId}/audit`))
  useRegisterShortcut('t', () => navigate(`/projects/${projectId}/tokens`))
  useRegisterShortcut('b', () => navigate('/projects'))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedProject?.name ?? 'Project'}
        subtitle="Choose a section to continue."
        actions={
          <Button
            variant="outline"
            className="flex items-center gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || envError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError}
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/environments`)}
            className="h-auto w-full flex-col items-start justify-start rounded-2xl border-border bg-card p-5 text-left shadow-soft hover:border-foreground/30 whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Environments
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {environments.length} environments
                </p>
              </div>
              <ShortcutHint keys="e" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/audit`)}
            className="h-auto w-full flex-col items-start justify-start rounded-2xl border-border bg-card p-5 text-left shadow-soft hover:border-foreground/30 whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  Audit log
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Review changes</p>
              </div>
              <ShortcutHint keys="a" />
            </div>
          </Button>
        </li>
        <li>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/tokens`)}
            className="h-auto w-full flex-col items-start justify-start rounded-2xl border-border bg-card p-5 text-left shadow-soft hover:border-foreground/30 whitespace-normal"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  API tokens
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Create access keys</p>
              </div>
              <ShortcutHint keys="t" />
            </div>
          </Button>
        </li>
      </ul>
    </section>
  )
}
