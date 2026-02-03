import { useCallback, useEffect, useState } from 'react'
import type { EnvironmentDto, ProjectDto, SecretDto } from '@secrets/shared'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { PageHeader } from '../components/PageHeader'
import { SecretsTable } from '../components/SecretsTable'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const EnvironmentPage = ({
  projectId,
  environmentId,
  navigate,
}: {
  projectId: string
  environmentId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()

  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)

  const [secrets, setSecrets] = useState<SecretDto[]>([])
  const [secretsLoading, setSecretsLoading] = useState(false)
  const [secretsError, setSecretsError] = useState<string | null>(null)
  const [includeValues, setIncludeValues] = useState(false)

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

  const loadSecrets = useCallback(
    async (include: boolean) => {
      setSecretsLoading(true)
      setSecretsError(null)
      try {
        const data = await api.listSecrets(environmentId, include)
        setSecrets(data)
      } catch (error) {
        setSecretsError(getErrorMessage(error))
      } finally {
        setSecretsLoading(false)
      }
    },
    [environmentId],
  )

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
      void loadSecrets(includeValues)
    }
  }, [user, includeValues, loadProjects, loadEnvironments, loadSecrets])

  const handleCreateEnvironment = async (name: string) => {
    await api.createEnvironment(projectId, { name })
    await loadEnvironments()
  }

  const handleCreateSecret = async (payload: { key: string; value: string }) => {
    await api.createSecret(environmentId, payload)
    await loadSecrets(includeValues)
  }

  const handleUpdateSecret = async (secretId: string, value: string) => {
    await api.updateSecret(secretId, { value })
    await loadSecrets(includeValues)
  }

  const handleRollbackSecret = async (secretId: string) => {
    await api.rollbackSecret(secretId)
    await loadSecrets(includeValues)
  }

  const handleDeleteSecret = async (secretId: string) => {
    await api.deleteSecret(secretId)
    await loadSecrets(includeValues)
  }

  const selectedEnvironment = environments.find((env) => env.id === environmentId) ?? null
  const selectedProject = projects.find((project) => project.id === projectId) ?? null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedEnvironment?.name ?? 'Environment'}
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => navigate(`/projects/${projectId}/environments`)}
          >
            Back to environments
          </button>
        }
      />

      {(projectsError || envError || secretsError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError || secretsError}
        </div>
      )}

      <EnvironmentsSection
        environments={environments}
        selectedEnvironmentId={environmentId}
        loading={envLoading}
        error={envError}
        onSelect={(envId) => navigate(`/projects/${projectId}/environments/${envId}`)}
        onCreate={handleCreateEnvironment}
      />

      <SecretsTable
        secrets={secrets}
        includeValues={includeValues}
        loading={secretsLoading}
        error={secretsError}
        onToggleValues={setIncludeValues}
        onCreate={handleCreateSecret}
        onUpdate={handleUpdateSecret}
        onRollback={handleRollbackSecret}
        onDelete={handleDeleteSecret}
      />
    </section>
  )
}
