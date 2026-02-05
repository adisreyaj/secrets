import type {
  ApprovalRequestDto,
  EnvironmentDto,
  ProjectDto,
  SecretDto,
} from '@secrets/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { getErrorMessage } from '../../lib/errors'
import { useAsyncResource } from '../../lib/useAsyncResource'

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export const useEnvironmentData = ({
  projectId,
  environmentId,
  enabled,
}: {
  projectId: string
  environmentId: string
  enabled: boolean
}) => {
  const { data: projectsData, error: projectsError } = useAsyncResource<
    ProjectDto[]
  >(async () => (enabled ? api.listProjects() : []), [enabled])
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const {
    data: environmentsData,
    loading: envLoading,
    error: envError,
    reload: loadEnvironments,
  } = useAsyncResource<EnvironmentDto[]>(
    async () => (enabled ? api.listEnvironments(projectId) : []),
    [enabled, projectId],
  )
  const environments = useMemo(() => environmentsData ?? [], [environmentsData])

  const resolvedEnvironmentId = environmentId

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
  const [approvals, setApprovals] = useState<ApprovalRequestDto[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalsError, setApprovalsError] = useState<string | null>(null)

  // Track last loaded combination to avoid redundant effect-triggered reload loops
  const lastSecretsEnvRef = useRef<string | null>(null)
  const lastSecretsValuesLoadedRef = useRef<boolean | null>(null)

  const loadSecrets = useCallback(
    async (include: boolean) => {
      if (!resolvedEnvironmentId) return false
      setSecretsLoading(true)
      setSecretsError(null)
      try {
        const data = await api.listSecrets(resolvedEnvironmentId, include)
        setSecrets(data)
        return true
      } catch (error) {
        setSecretsError(getErrorMessage(error))
        return false
      } finally {
        setSecretsLoading(false)
      }
    },
    [resolvedEnvironmentId],
  )

  const loadApprovals = useCallback(async () => {
    if (!resolvedEnvironmentId) return
    setApprovalsLoading(true)
    setApprovalsError(null)
    try {
      const data = await api.listApprovals(projectId, {
        status: 'PENDING',
        environmentId: resolvedEnvironmentId,
      })
      setApprovals(data)
    } catch (error) {
      setApprovalsError(getErrorMessage(error))
    } finally {
      setApprovalsLoading(false)
    }
  }, [projectId, resolvedEnvironmentId])

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
    if (!enabled || !resolvedEnvironmentId) return

    // Prevent repeated loads for the same environment/visibility combination,
    // which can cause deep update chains if some parent prop is unstable.
    if (
      lastSecretsEnvRef.current === resolvedEnvironmentId &&
      lastSecretsValuesLoadedRef.current === valuesLoaded
    ) {
      return
    }

    lastSecretsEnvRef.current = resolvedEnvironmentId
    lastSecretsValuesLoadedRef.current = valuesLoaded
    void loadSecrets(valuesLoaded)
  }, [enabled, resolvedEnvironmentId, valuesLoaded, loadSecrets])

  useEffect(() => {
    if (enabled && environments.length > 0) {
      void loadSecretCoverage()
    }
  }, [enabled, environments, loadSecretCoverage])

  useEffect(() => {
    if (enabled) {
      void loadApprovals()
    }
  }, [enabled, loadApprovals])

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
    await api.createEnvironment(projectId, {
      name: payload.name,
      copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
    })
    await loadEnvironments()
  }

  const handleCreateSecret = async (payload: {
    key: string
    value: string
  }) => {
    if (!resolvedEnvironmentId) return
    const result = await api.createSecret(resolvedEnvironmentId, payload)
    if ('status' in result && result.status === 'pending') {
      await loadApprovals()
      return
    }
    await loadSecrets(valuesLoaded)
  }

  const handleUpdateSecrets = async (
    changes: { id: string; key?: string; value?: string }[],
  ) => {
    let keyUpdated = false
    for (const change of changes) {
      if (change.key !== undefined) {
        keyUpdated = true
      }
      const result = await api.updateSecret(change.id, {
        key: change.key,
        value: change.value,
      })
      if ('status' in result && result.status === 'pending') {
        await loadApprovals()
        continue
      }
    }
    await loadSecrets(valuesLoaded)
    if (keyUpdated) {
      await loadSecretCoverage()
    }
  }

  const handleRollbackSecret = async (secretId: string) => {
    const result = await api.rollbackSecret(secretId)
    if ('status' in result && result.status === 'pending') {
      await loadApprovals()
      return
    }
    await loadSecrets(valuesLoaded)
  }

  const handleDeleteSecret = async (secretId: string) => {
    const result = await api.deleteSecret(secretId)
    if ('status' in result && result.status === 'pending') {
      await loadApprovals()
      return
    }
    await loadSecrets(valuesLoaded)
  }

  const handleDiffSecret = async (
    secretId: string,
    versions?: { from?: string; to?: string },
  ) => {
    return api.getSecretDiff(secretId, versions)
  }

  const handleListSecretVersions = async (secretId: string) => {
    return api.listSecretVersions(secretId)
  }

  const handleCopySecret = async (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => {
    const result = await api.copySecret(secretId, payload)
    if ('status' in result && result.status === 'pending') {
      await loadApprovals()
      return result
    }
    await loadSecretCoverage()
    return result
  }

  const handleCopyMissingSecrets = async (
    sourceEnvironmentId: string,
    keys: string[],
  ) => {
    if (!resolvedEnvironmentId) return
    const result = await api.copySecretsFromEnvironment(resolvedEnvironmentId, {
      sourceEnvironmentId,
      keys,
      overwrite: false,
    })
    if ('status' in result && result.status === 'pending') {
      await loadApprovals()
      return result
    }
    await loadSecretCoverage()
    await loadSecrets(valuesLoaded)
    return result
  }

  const selectedEnvironment =
    environments.find((env) => env.id === (resolvedEnvironmentId ?? environmentId)) ??
    null
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null
  const environmentOptions = useMemo(
    () => environments.map((env) => ({ id: env.id, name: env.name })),
    [environments],
  )

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
    const activeEnvId = resolvedEnvironmentId ?? environmentId
    const currentKeys = new Set(secretKeyIndex[activeEnvId] ?? [])
    const missing: string[] = []
    for (const key of allSecretKeys) {
      if (!currentKeys.has(key)) {
        missing.push(key)
      }
    }
    missing.sort((a, b) => a.localeCompare(b))
    return missing
  }, [allSecretKeys, environmentId, resolvedEnvironmentId, secretKeyIndex])

  const missingKeysByEnvironment = useMemo(() => {
    const activeEnvId = resolvedEnvironmentId ?? environmentId
    const currentKeys = new Set(secretKeyIndex[activeEnvId] ?? [])
    const map: Record<string, string[]> = {}
    for (const env of environments) {
      if (env.id === activeEnvId) continue
      const keys = secretKeyIndex[env.id] ?? []
      const candidates = keys.filter((key) => !currentKeys.has(key))
      if (candidates.length > 0) {
        map[env.id] = candidates.sort((a, b) => a.localeCompare(b))
      }
    }
    return map
  }, [environmentId, environments, resolvedEnvironmentId, secretKeyIndex])

  const secretByKey = useMemo(() => {
    const map = new Map<string, SecretDto>()
    for (const secret of secrets) {
      map.set(secret.key, secret)
    }
    return map
  }, [secrets])

  const pendingBySecretId = useMemo(() => {
    const map = new Map<string, ApprovalRequestDto>()
    for (const approval of approvals) {
      if (approval.secretId) {
        map.set(approval.secretId, approval)
      }
    }
    return map
  }, [approvals])

  const handleExportEnv = async () => {
    if (!selectedEnvironment) return
    const content = await api.exportEnv(selectedEnvironment.id)
    const projectSlug =
      toSlug(selectedProject?.name ?? projectId.slice(0, 6)) ||
      projectId.slice(0, 6)
    const environmentSlug =
      toSlug(selectedEnvironment.name) || selectedEnvironment.id.slice(0, 6)
    const filename = `${projectSlug}-${environmentSlug}.env`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    if (!selectedEnvironment) return
    const escape = (value: string) =>
      value.includes(',') || value.includes('"') || value.includes('\n')
        ? `"${value.replace(/"/g, '""')}"`
        : value
    const lines = ['key,value,updated_at']
    for (const secret of secrets) {
      const value = valuesLoaded ? (secret.value ?? '') : ''
      lines.push(
        `${escape(secret.key)},${escape(value)},${escape(secret.updatedAt)}`,
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${toSlug(selectedEnvironment.name)}-secrets.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return {
    projects,
    projectsError,
    environments,
    envLoading,
    envError,
    secrets,
    secretsLoading,
    secretsError,
    valuesVisible,
    valuesLoaded,
    coverageLoading,
    coverageError,
    approvals,
    approvalsLoading,
    approvalsError,
    missingKeys,
    missingKeysByEnvironment,
    secretByKey,
    pendingBySecretId,
    selectedEnvironment,
    selectedProject,
    environmentOptions,
    handleToggleValues,
    handleCreateEnvironment,
    handleCreateSecret,
    handleUpdateSecrets,
    handleRollbackSecret,
    handleDeleteSecret,
    handleDiffSecret,
    handleListSecretVersions,
    handleCopySecret,
    handleCopyMissingSecrets,
    handleExportEnv,
    handleExportCsv,
    loadSecrets,
    loadSecretCoverage,
    loadApprovals,
  }
}
