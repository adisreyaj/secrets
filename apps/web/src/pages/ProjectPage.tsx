import { useCallback, useEffect, useState } from 'react'
import type { ApiTokenDto, AuditLogDto, EnvironmentDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { AuditLog } from '../components/AuditLog'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { Hero } from '../components/Hero'
import { ProjectsSection, type ProjectTemplate } from '../components/ProjectsSection'
import { TokensPanel } from '../components/TokensPanel'
import { Button } from '../components/ui/button'
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

  const handleCreateProject = async (payload: { name: string; template: ProjectTemplate }) => {
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
  }

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => {
    await api.createEnvironment(projectId, {
      name: payload.name,
      copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
    })
    await loadEnvironments()
  }

  const handleCreateToken = async (name: string, readOnly: boolean) => {
    const data = await api.createToken(projectId, { name, readOnly })
    setLastToken(data)
    await loadTokens()
    return data
  }

  const handleDeleteToken = async (tokenId: string) => {
    await api.deleteToken(projectId, tokenId)
    await loadTokens()
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
          <Button
            variant="outline"
            className="gap-2 rounded-full border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:border-foreground/40"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Button>
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

      <section>
        <EnvironmentsSection
          environments={environments}
          selectedEnvironmentId={selectedEnvironmentId}
          loading={envLoading}
          error={envError}
          missingCounts={{}}
          coverageLoading={false}
          onSelect={(environmentId) => {
            setSelectedEnvironmentId(environmentId)
            navigate(`/projects/${projectId}/environments/${environmentId}`)
          }}
          onCreate={handleCreateEnvironment}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <AuditLog audits={auditLogs} loading={auditLoading} error={auditError} />
        <TokensPanel
          tokens={tokens}
          loading={tokensLoading}
          error={tokensError}
          onCreate={handleCreateToken}
          onDelete={handleDeleteToken}
          lastCreated={lastToken}
          onClearLastCreated={() => setLastToken(null)}
        />
      </section>
    </section>
  )
}
