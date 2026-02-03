import { useCallback, useEffect, useState } from 'react'
import type { ApiTokenDto, AuditLogDto, EnvironmentDto, ProjectDto } from '@secrets/shared'
import { AuditLog } from '../components/AuditLog'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { Hero } from '../components/Hero'
import { ProjectsSection } from '../components/ProjectsSection'
import { TokensPanel } from '../components/TokensPanel'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ProjectPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null)

  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  const [tokens, setTokens] = useState<ApiTokenDto[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokensError, setTokensError] = useState<string | null>(null)
  const [lastToken, setLastToken] = useState<Awaited<ReturnType<typeof api.createToken>> | null>(null)

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

  const loadEnvironments = useCallback(async () => {
    setEnvLoading(true)
    setEnvError(null)
    try {
      const data = await api.listEnvironments(projectId)
      setEnvironments(data)
      if (data.length > 0) {
        setSelectedEnvironmentId((prev) => prev ?? data[0].id)
      }
    } catch (error) {
      setEnvError(getErrorMessage(error))
    } finally {
      setEnvLoading(false)
    }
  }, [projectId])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    setAuditError(null)
    try {
      const data = await api.listAudit(projectId)
      setAuditLogs(data)
    } catch (error) {
      setAuditError(getErrorMessage(error))
    } finally {
      setAuditLoading(false)
    }
  }, [projectId])

  const loadTokens = useCallback(async () => {
    setTokensLoading(true)
    setTokensError(null)
    try {
      const data = await api.listTokens(projectId)
      setTokens(data)
    } catch (error) {
      setTokensError(getErrorMessage(error))
    } finally {
      setTokensLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    setSelectedEnvironmentId(null)
  }, [projectId])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
      void loadAudit()
      void loadTokens()
    }
  }, [user, projectId, loadProjects, loadEnvironments, loadAudit, loadTokens])

  const handleCreateProject = async (name: string) => {
    await api.createProject({ name })
    await loadProjects()
  }

  const handleCreateEnvironment = async (name: string) => {
    await api.createEnvironment(projectId, { name })
    await loadEnvironments()
  }

  const handleExportEnv = async () => {
    if (!selectedEnvironmentId) return
    const content = await api.exportEnv(selectedEnvironmentId)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${selectedEnvironmentId}.env`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleCreateToken = async (name: string) => {
    const data = await api.createToken(projectId, { name })
    setLastToken(data)
    await loadTokens()
    return data
  }

  const selectedProject = projects.find((project) => project.id === projectId) ?? null

  return (
    <section className="flex flex-col gap-10">
      <Hero
        title={selectedProject?.name ?? 'Project workspace'}
        subtitle="Track environments, issue access tokens, and keep audit trails across every secret change."
        stats={[
          { label: 'Environments', value: environments.length.toString() },
          { label: 'Audit events', value: auditLogs.length.toString() },
          { label: 'Tokens', value: tokens.length.toString() },
          { label: 'Project role', value: selectedProject?.role ?? 'Member' },
        ]}
        actions={
          <>
            <button
              className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={handleExportEnv}
              disabled={!selectedEnvironmentId}
            >
              Export .env
            </button>
            <button
              className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              onClick={() => navigate('/projects')}
            >
              Back to projects
            </button>
          </>
        }
      />

      <ProjectsSection
        projects={projects}
        selectedProjectId={projectId}
        loading={projectsLoading}
        error={projectsError}
        onSelect={(id) => navigate(`/projects/${id}`)}
        onCreate={handleCreateProject}
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <EnvironmentsSection
          environments={environments}
          selectedEnvironmentId={selectedEnvironmentId}
          loading={envLoading}
          error={envError}
          onSelect={(environmentId) => {
            setSelectedEnvironmentId(environmentId)
            navigate(`/projects/${projectId}/environments/${environmentId}`)
          }}
          onCreate={handleCreateEnvironment}
        />

        <section className="rounded-3xl border border-white/70 bg-slate-900 p-6 text-white shadow-soft">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Export</p>
          <h2 className="mt-2 text-2xl font-semibold">Ship secrets safely</h2>
          <p className="mt-3 text-sm text-white/70">
            Generate a time-bound .env file with masked values and share securely with your runtime.
          </p>
          <ul className="mt-6 space-y-3 text-xs text-white/70">
            {['Rotation reminder: keep values fresh', 'Audit trail included', 'Tokenized downloads'].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  <span>{item}</span>
                </li>
              ),
            )}
          </ul>
          <button
            onClick={handleExportEnv}
            disabled={!selectedEnvironmentId}
            className="mt-6 w-full rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            Download .env
          </button>
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <AuditLog audits={auditLogs} loading={auditLoading} error={auditError} />
        <TokensPanel
          tokens={tokens}
          loading={tokensLoading}
          error={tokensError}
          onCreate={handleCreateToken}
          lastCreated={lastToken}
          onClearLastCreated={() => setLastToken(null)}
        />
      </section>
    </section>
  )
}
