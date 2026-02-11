import type { EnvironmentDto, FeatureFlagSdkKeyDto, ProjectDto } from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { flagSdkKeysPath, flagsPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { getLastEnvironmentId } from '../lib/shortcuts.utils'
import { useRequireAuth } from '../lib/useRequireAuth'
import { toast } from 'sonner'

type FlagSdkKeysPageProps = {
  projectId: string
  environmentId: string | null
  navigate: (path: string) => void
}

const scopeLabel = (environmentIds?: string[] | null) => {
  if (!environmentIds || environmentIds.length === 0) return 'All environments'
  return `${environmentIds.length} selected`
}

export const FlagSdkKeysPage = ({
  projectId,
  environmentId,
  navigate,
}: FlagSdkKeysPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const [name, setName] = useState('Client SDK key')
  const [lastIssuedKey, setLastIssuedKey] = useState<string | null>(null)
  const [scopeMode, setScopeMode] = useState<'all' | 'selected'>('all')
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([])
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [editingScopeMode, setEditingScopeMode] = useState<'all' | 'selected'>('all')
  const [editingScopeIds, setEditingScopeIds] = useState<string[]>([])
  const [scopeWarning, setScopeWarning] = useState<string | null>(null)

  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const {
    data: environmentsData,
    isLoading: environmentsLoading,
    error: environmentsErrorRaw,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const environments = asArray(environmentsData)
  const selectedEnvironment = useMemo(
    () => environments.find((env) => env.id === environmentId) ?? null,
    [environments, environmentId],
  )

  useEffect(() => {
    if (!projectId || environmentsLoading || environments.length === 0 || selectedEnvironment) {
      return
    }
    const lastEnvironmentId = getLastEnvironmentId(projectId)
    const fallbackEnvironment =
      environments.find((env) => env.id === lastEnvironmentId) ?? environments[0]
    if (!fallbackEnvironment) return
    navigate(flagSdkKeysPath(projectId, undefined, fallbackEnvironment.id))
  }, [
    projectId,
    environments,
    environmentsLoading,
    selectedEnvironment,
    navigate,
  ])

  const activeEnvironmentId = selectedEnvironment?.id ?? null

  const { data: keysData, error: keysErrorRaw, isLoading: keysLoading } = useQuery<
    FeatureFlagSdkKeyDto[]
  >({
    queryKey: queryKeys.flagSdkKeys(projectId, activeEnvironmentId),
    queryFn: () => api.listFlagSdkKeys(projectId, activeEnvironmentId),
    enabled: Boolean(user) && Boolean(projectId) && Boolean(activeEnvironmentId),
  })

  const projects = asArray(projectsData)
  const keys = asArray(keysData)
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () =>
    navigate(flagsPath(projectId, selectedProject?.slug, activeEnvironmentId)),
  )

  const toggleScopeId = (scopeId: string, on: boolean, forEdit = false) => {
    const update = (prev: string[]) =>
      on ? [...new Set([...prev, scopeId])] : prev.filter((id) => id !== scopeId)
    if (forEdit) {
      setEditingScopeIds(update)
      return
    }
    setSelectedScopeIds(update)
  }

  const createKey = async () => {
    if (!name.trim()) return
    setScopeWarning(null)
    try {
      const created = await api.createFlagSdkKey(projectId, {
        name: name.trim(),
        environmentIds: scopeMode === 'selected' ? selectedScopeIds : undefined,
      })
      setLastIssuedKey(created.key)
      setName('Client SDK key')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.flagSdkKeys(projectId, activeEnvironmentId),
      })
      toast.success('SDK key created.')
    } catch (error) {
      const message = getErrorMessage(error)
      setScopeWarning(message)
      toast.error(message)
    }
  }

  const rotateKey = async (key: FeatureFlagSdkKeyDto) => {
    setScopeWarning(null)
    const scope = scopeLabel(key.environmentIds)
    const confirmed = window.confirm(
      `Rotate this SDK key scoped to ${scope}? Existing clients must update to the new secret.`,
    )
    if (!confirmed) return

    try {
      const rotated = await api.rotateFlagSdkKey(key.id, key.environmentIds)
      setLastIssuedKey(rotated.key)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.flagSdkKeys(projectId, activeEnvironmentId),
      })
      toast.success('SDK key rotated.')
    } catch (error) {
      const message = getErrorMessage(error)
      setScopeWarning(message)
      toast.error(message)
    }
  }

  const startEditScope = (key: FeatureFlagSdkKeyDto) => {
    setEditingKeyId(key.id)
    if (!key.environmentIds || key.environmentIds.length === 0) {
      setEditingScopeMode('all')
      setEditingScopeIds([])
      return
    }
    setEditingScopeMode('selected')
    setEditingScopeIds(key.environmentIds)
  }

  const saveScope = async (keyId: string) => {
    setScopeWarning(null)
    try {
      await api.updateFlagSdkKey(keyId, {
        environmentIds: editingScopeMode === 'selected' ? editingScopeIds : [],
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.flagSdkKeys(projectId, activeEnvironmentId),
      })
      setEditingKeyId(null)
      toast.success('SDK key scope updated.')
    } catch (error) {
      const message = getErrorMessage(error)
      setScopeWarning(message)
      toast.error(message)
    }
  }

  const revokeKey = async (keyId: string) => {
    setScopeWarning(null)
    try {
      await api.revokeFlagSdkKey(keyId)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.flagSdkKeys(projectId, activeEnvironmentId),
      })
      toast.success('SDK key revoked.')
    } catch (error) {
      const message = getErrorMessage(error)
      setScopeWarning(message)
      toast.error(message)
    }
  }

  const projectsError = projectsErrorRaw ? getErrorMessage(projectsErrorRaw) : null
  const keysError = keysErrorRaw ? getErrorMessage(keysErrorRaw) : null
  const environmentsError = environmentsErrorRaw
    ? getErrorMessage(environmentsErrorRaw)
    : null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Flag SDK keys"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              navigate(flagsPath(projectId, selectedProject?.slug, activeEnvironmentId))
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back to flags
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || keysError || environmentsError || scopeWarning) && (
        <ErrorBanner message={projectsError || keysError || environmentsError || scopeWarning} />
      )}

      <SectionCard>
        <SectionHeader kicker="Context" title="Environment selection" />
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1">
            <p className="text-sm font-medium">Environment</p>
            <Select
              value={activeEnvironmentId ?? ''}
              onValueChange={(value) =>
                navigate(flagSdkKeysPath(projectId, selectedProject?.slug, value))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary">
            Environment: {selectedEnvironment?.name ?? 'Not selected'}
          </Badge>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Create" title="Issue new SDK key" />
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="SDK key name"
              className="max-w-sm"
            />
            <Button onClick={createKey}>Create key</Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Environment scope</p>
            <Select
              value={scopeMode}
              onValueChange={(value) => setScopeMode(value as 'all' | 'selected')}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All environments</SelectItem>
                <SelectItem value="selected">Selected environments</SelectItem>
              </SelectContent>
            </Select>
            {scopeMode === 'selected' ? (
              <div className="grid gap-2 md:grid-cols-2">
                {environments.map((env) => {
                  const checked = selectedScopeIds.includes(env.id)
                  return (
                    <label key={env.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          toggleScopeId(env.id, Boolean(next))
                        }
                      />
                      {env.name}
                    </label>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
        {lastIssuedKey ? (
          <p className="text-muted-foreground mt-3 text-xs break-all">
            New key (copy now): {lastIssuedKey}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Keys" title="Active SDK keys" />
        <div className="mt-4 space-y-3">
          {keysLoading ? (
            <p className="text-muted-foreground text-sm">Loading keys...</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No SDK keys yet.</p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="border-border/70 bg-card/70 rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{key.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {key.keyPrefix}... · created {formatDate(key.createdAt)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Last used:{' '}
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Scope: {scopeLabel(key.environmentIds)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateKey(key)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Rotate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditScope(key)}
                    >
                      Edit scope
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => revokeKey(key.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>

                {editingKeyId === key.id ? (
                  <div className="mt-4 border-border/70 rounded-xl border p-3">
                    <p className="text-sm font-medium">Update environment scope</p>
                    <div className="mt-2 space-y-2">
                      <Select
                        value={editingScopeMode}
                        onValueChange={(value) =>
                          setEditingScopeMode(value as 'all' | 'selected')
                        }
                      >
                        <SelectTrigger className="max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All environments</SelectItem>
                          <SelectItem value="selected">Selected environments</SelectItem>
                        </SelectContent>
                      </Select>
                      {editingScopeMode === 'selected' ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {environments.map((env) => {
                            const checked = editingScopeIds.includes(env.id)
                            return (
                              <label key={env.id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) =>
                                    toggleScopeId(env.id, Boolean(next), true)
                                  }
                                />
                                {env.name}
                              </label>
                            )
                          })}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveScope(key.id)}>
                          Save scope
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingKeyId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </section>
  )
}
