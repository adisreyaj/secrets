import type { EnvironmentDto, ProjectDto, SecretDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { SecretsTable } from '../components/SecretsTable'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
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
  const [valuesVisible, setValuesVisible] = useState(false)
  const [valuesLoaded, setValuesLoaded] = useState(false)
  const [secretKeyIndex, setSecretKeyIndex] = useState<
    Record<string, string[]>
  >({})
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copyFromId, setCopyFromId] = useState<string>('none')

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
        return true
      } catch (error) {
        setSecretsError(getErrorMessage(error))
        return false
      } finally {
        setSecretsLoading(false)
      }
    },
    [environmentId],
  )

  const loadSecretCoverage = useCallback(async () => {
    if (environments.length === 0) {
      setSecretKeyIndex({})
      return
    }

    setCoverageLoading(true)
    setCoverageError(null)
    try {
      const entries = await Promise.all(
        environments.map(async (env) => {
          const data = await api.listSecrets(env.id, false)
          return [env.id, data.map((secret) => secret.key)] as const
        }),
      )
      const next: Record<string, string[]> = {}
      for (const [envId, keys] of entries) {
        next[envId] = keys
      }
      setSecretKeyIndex(next)
    } catch (error) {
      setCoverageError(getErrorMessage(error))
    } finally {
      setCoverageLoading(false)
    }
  }, [environments])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
    }
  }, [user, loadProjects, loadEnvironments])

  useEffect(() => {
    if (user) {
      void loadSecrets(valuesLoaded)
    }
  }, [user, valuesLoaded, loadSecrets])

  useEffect(() => {
    if (user && environments.length > 0) {
      void loadSecretCoverage()
    }
  }, [user, environments, loadSecretCoverage])

  useEffect(() => {
    if (!dialogOpen) {
      setName('')
      setCopyFromId('none')
    }
  }, [dialogOpen])

  const allSecretKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const list of Object.values(secretKeyIndex)) {
      for (const key of list) {
        keys.add(key)
      }
    }
    return keys
  }, [secretKeyIndex])

  const missingKeys = useMemo(() => {
    const currentKeys = new Set(secretKeyIndex[environmentId] ?? [])
    const missing: string[] = []
    for (const key of allSecretKeys) {
      if (!currentKeys.has(key)) {
        missing.push(key)
      }
    }
    missing.sort((a, b) => a.localeCompare(b))
    return missing
  }, [allSecretKeys, environmentId, secretKeyIndex])

  const missingKeysByEnvironment = useMemo(() => {
    const currentKeys = new Set(secretKeyIndex[environmentId] ?? [])
    const map: Record<string, string[]> = {}
    for (const env of environments) {
      if (env.id === environmentId) continue
      const keys = secretKeyIndex[env.id] ?? []
      const candidates = keys.filter((key) => !currentKeys.has(key))
      if (candidates.length > 0) {
        map[env.id] = candidates.sort((a, b) => a.localeCompare(b))
      }
    }
    return map
  }, [environmentId, environments, secretKeyIndex])

  const handleToggleValues = async (nextVisible: boolean) => {
    if (nextVisible && !valuesLoaded) {
      const loaded = await loadSecrets(true)
      if (loaded) {
        setValuesLoaded(true)
      }
    }
    setValuesVisible(nextVisible)
  }

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => {
    await api.createEnvironment(projectId, payload)
    await loadEnvironments()
  }

  const handleCreateSecret = async (payload: {
    key: string
    value: string
  }) => {
    await api.createSecret(environmentId, payload)
    await loadSecrets(valuesLoaded)
  }

  const handleUpdateSecret = async (secretId: string, value: string) => {
    await api.updateSecret(secretId, { value })
    await loadSecrets(valuesLoaded)
  }

  const handleRollbackSecret = async (secretId: string) => {
    await api.rollbackSecret(secretId)
    await loadSecrets(valuesLoaded)
  }

  const handleDeleteSecret = async (secretId: string) => {
    await api.deleteSecret(secretId)
    await loadSecrets(valuesLoaded)
  }

  const handleCopySecret = async (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => {
    const result = await api.copySecret(secretId, payload)
    await loadSecretCoverage()
    return result
  }

  const handleCopyMissingSecrets = async (
    sourceEnvironmentId: string,
    keys: string[],
  ) => {
    const result = await api.copySecretsFromEnvironment(environmentId, {
      sourceEnvironmentId,
      keys,
      overwrite: false,
    })
    await loadSecretCoverage()
    await loadSecrets(valuesLoaded)
    return result
  }

  const selectedEnvironment =
    environments.find((env) => env.id === environmentId) ?? null
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null
  const environmentOptions = useMemo(
    () => environments.map((env) => ({ id: env.id, name: env.name })),
    [environments],
  )

  const handleCreateEnvironmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      await handleCreateEnvironment({
        name: trimmedName,
        copyFromEnvironmentId: copyFromId !== 'none' ? copyFromId : undefined,
      })
      setDialogOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedEnvironment?.name ?? 'Environment'}
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => navigate(`/projects/${projectId}/environments`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to environments
          </Button>
        }
      />

      {(projectsError || envError || secretsError || coverageError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError || secretsError || coverageError}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Environments
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            {envLoading ? (
              <div className="border-border bg-card/70 text-muted-foreground rounded-full border border-dashed px-4 py-2 text-sm">
                Loading environments...
              </div>
            ) : environments.length === 0 ? (
              <div className="border-border bg-card/70 text-muted-foreground rounded-full border border-dashed px-4 py-2 text-sm">
                Create your first environment.
              </div>
            ) : (
              <Tabs
                value={environmentId}
                onValueChange={(envId) =>
                  navigate(`/projects/${projectId}/environments/${envId}`)
                }
                className="w-full"
              >
                <div className="overflow-x-auto pb-1">
                  <TabsList className="w-max">
                    {environments.map((env) => (
                      <TabsTrigger
                        key={env.id}
                        value={env.id}
                        className="gap-2"
                      >
                        <span className="font-semibold">{env.name}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </Tabs>
            )}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-border text-foreground hover:border-foreground/40 gap-2 rounded-full px-4 text-sm font-semibold"
              >
                New environment
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
              <DialogHeader className="text-left">
                <DialogTitle>Create environment</DialogTitle>
                <DialogDescription>
                  Spin up a new environment and optionally duplicate keys from
                  an existing one.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={handleCreateEnvironmentSubmit}
                className="grid gap-4"
              >
                <label className="grid gap-2 text-sm">
                  <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                    Environment name
                  </span>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. staging"
                    className="bg-background h-11 rounded-2xl px-4"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                    Copy keys from
                  </span>
                  <Select
                    value={copyFromId}
                    onValueChange={setCopyFromId}
                    disabled={environmentOptions.length === 0}
                  >
                    <SelectTrigger className="h-11 px-4">
                      <SelectValue placeholder="Don't copy anything" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Don&apos;t copy anything
                      </SelectItem>
                      {environmentOptions.map((env) => (
                        <SelectItem key={env.id} value={env.id}>
                          {env.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-xs">
                    Copies keys (and current values) into the new environment.
                  </span>
                </label>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full px-4 text-sm"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-6 text-sm font-semibold"
                    disabled={creating || !name.trim()}
                  >
                    {creating ? 'Creating...' : 'Create environment'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <SecretsTable
        secrets={secrets}
        environments={environments}
        environmentId={environmentId}
        includeValues={valuesVisible}
        loading={secretsLoading}
        coverageLoading={coverageLoading}
        error={secretsError}
        missingKeys={missingKeys}
        missingKeysByEnvironment={missingKeysByEnvironment}
        onToggleValues={handleToggleValues}
        onCreate={handleCreateSecret}
        onUpdate={handleUpdateSecret}
        onRollback={handleRollbackSecret}
        onDelete={handleDeleteSecret}
        onCopy={handleCopySecret}
        onCopyMissing={handleCopyMissingSecrets}
      />
    </section>
  )
}
