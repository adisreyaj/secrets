import type {
  ApprovalRequestDto,
  EnvironmentDto,
  ProjectDto,
  SecretDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { getErrorMessage } from '../../lib/errors'
import { queryKeys } from '../../lib/queryKeys'

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
  const queryClient = useQueryClient()

  const {
    data: projectsData,
    error: projectsErrorRaw,
  } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled,
  })

  const projects = useMemo(() => projectsData ?? [], [projectsData])

  const {
    data: environmentsData,
    isLoading: envLoading,
    error: envErrorRaw,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: enabled && Boolean(projectId),
  })

  const environments = useMemo(() => environmentsData ?? [], [environmentsData])

  const resolvedEnvironmentId = environmentId

  const [valuesVisible, setValuesVisible] = useState(false)
  const [valuesLoaded, setValuesLoaded] = useState(false)

  const {
    data: secretsKeysData,
    isLoading: secretsKeysLoading,
    error: secretsKeysErrorRaw,
  } = useQuery<SecretDto[]>({
    queryKey: queryKeys.secrets(resolvedEnvironmentId, false),
    queryFn: () => api.listSecrets(resolvedEnvironmentId, false),
    enabled: enabled && Boolean(resolvedEnvironmentId),
  })

  const {
    data: secretsValuesData,
    isLoading: secretsValuesLoading,
    error: secretsValuesErrorRaw,
  } = useQuery<SecretDto[]>({
    queryKey: queryKeys.secrets(resolvedEnvironmentId, true),
    queryFn: () => api.listSecrets(resolvedEnvironmentId, true),
    enabled: enabled && Boolean(resolvedEnvironmentId) && valuesLoaded,
  })

  const secrets = useMemo(() => {
    if (valuesLoaded) {
      return secretsValuesData ?? secretsKeysData ?? []
    }
    return secretsKeysData ?? []
  }, [secretsKeysData, secretsValuesData, valuesLoaded])

  const secretsLoading = valuesLoaded ? secretsValuesLoading : secretsKeysLoading
  const secretsErrorRaw = valuesLoaded
    ? secretsValuesErrorRaw ?? secretsKeysErrorRaw
    : secretsKeysErrorRaw

  const {
    data: approvalsData,
    isLoading: approvalsLoading,
    error: approvalsErrorRaw,
  } = useQuery<ApprovalRequestDto[]>({
    queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
    queryFn: () =>
      api.listApprovals(projectId, {
        status: 'PENDING',
        environmentId: resolvedEnvironmentId,
      }),
    enabled: enabled && Boolean(projectId) && Boolean(resolvedEnvironmentId),
  })

  const approvals = approvalsData ?? []

  const {
    data: secretCoverageData,
    isLoading: coverageLoading,
    error: coverageErrorRaw,
  } = useQuery<Record<string, string[]>>({
    queryKey: queryKeys.secretCoverage(projectId),
    queryFn: async () => {
      if (environments.length === 0) return {}
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
      return next
    },
    enabled: enabled && environments.length > 0,
  })

  const secretKeyIndex = secretCoverageData ?? {}

  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null
  const envError = envErrorRaw ? getErrorMessage(envErrorRaw) : null
  const secretsError = secretsErrorRaw ? getErrorMessage(secretsErrorRaw) : null
  const approvalsError = approvalsErrorRaw
    ? getErrorMessage(approvalsErrorRaw)
    : null
  const coverageError = coverageErrorRaw
    ? getErrorMessage(coverageErrorRaw)
    : null

  const handleToggleValues = async (nextVisible: boolean) => {
    if (nextVisible && !valuesLoaded && resolvedEnvironmentId) {
      try {
        await queryClient.fetchQuery({
          queryKey: queryKeys.secrets(resolvedEnvironmentId, true),
          queryFn: () => api.listSecrets(resolvedEnvironmentId, true),
        })
        setValuesLoaded(true)
      } catch {
        // leave valuesLoaded false on failure
      }
    }
    setValuesVisible(nextVisible)
  }

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => {
    try {
      await api.createEnvironment(projectId, {
        name: payload.name,
        copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.environments(projectId),
      })
      toast.success('Environment created.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleCreateSecret = async (payload: {
    key: string
    value: string
  }) => {
    if (!resolvedEnvironmentId) return
    try {
      const result = await api.createSecret(resolvedEnvironmentId, payload)
      if ('status' in result && result.status === 'pending') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
        })
        toast.info('Approval requested for secret.')
        return
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets(resolvedEnvironmentId, valuesLoaded),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secretCoverage(projectId),
      })
      toast.success('Secret created.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleUpdateSecrets = async (
    changes: { id: string; key?: string; value?: string }[],
  ) => {
    let keyUpdated = false
    let pendingCount = 0
    try {
      for (const change of changes) {
        if (change.key !== undefined) {
          keyUpdated = true
        }
        const result = await api.updateSecret(change.id, {
          key: change.key,
          value: change.value,
        })
        if ('status' in result && result.status === 'pending') {
          pendingCount += 1
          await queryClient.invalidateQueries({
            queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
          })
          continue
        }
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets(resolvedEnvironmentId, valuesLoaded),
      })
      if (keyUpdated) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.secretCoverage(projectId),
        })
      }
      const updatedCount = Math.max(changes.length - pendingCount, 0)
      if (updatedCount > 0) {
        toast.success(`Updated ${updatedCount} secret${updatedCount === 1 ? '' : 's'}.`)
      }
      if (pendingCount > 0) {
        toast.info(
          `Approval requested for ${pendingCount} change${pendingCount === 1 ? '' : 's'}.`,
        )
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleRollbackSecret = async (secretId: string) => {
    try {
      const result = await api.rollbackSecret(secretId)
      if ('status' in result && result.status === 'pending') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
        })
        toast.info('Rollback submitted for approval.')
        return
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets(resolvedEnvironmentId, valuesLoaded),
      })
      toast.success('Secret rolled back.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleDeleteSecret = async (secretId: string) => {
    try {
      const result = await api.deleteSecret(secretId)
      if ('status' in result && result.status === 'pending') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
        })
        toast.info('Delete submitted for approval.')
        return
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets(resolvedEnvironmentId, valuesLoaded),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secretCoverage(projectId),
      })
      toast.success('Secret deleted.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
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
    try {
      const result = await api.copySecret(secretId, payload)
      if ('status' in result && result.status === 'pending') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
        })
        toast.info('Copy submitted for approval.')
        return result
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secretCoverage(projectId),
      })
      if ('created' in result) {
        const total = result.created.length + result.updated.length
        toast.success(
          `Copied to ${total} environment${total === 1 ? '' : 's'}.`,
        )
      }
      return result
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleCopyMissingSecrets = async (
    sourceEnvironmentId: string,
    keys: string[],
    overwrite: boolean,
  ) => {
    if (!resolvedEnvironmentId) return
    try {
      const result = await api.copySecretsFromEnvironment(resolvedEnvironmentId, {
        sourceEnvironmentId,
        keys,
        overwrite,
      })
      if ('status' in result && result.status === 'pending') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
        })
        return result
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secretCoverage(projectId),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets(resolvedEnvironmentId, valuesLoaded),
      })
      return result
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
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
    const currentKeys = new Set(secrets.map((secret) => secret.key))
    const missing: string[] = []
    for (const key of allSecretKeys) {
      if (!currentKeys.has(key)) {
        missing.push(key)
      }
    }
    missing.sort((a, b) => a.localeCompare(b))
    return missing
  }, [allSecretKeys, environmentId, resolvedEnvironmentId, secrets])

  const missingKeysByEnvironment = useMemo(() => {
    const activeEnvId = resolvedEnvironmentId ?? environmentId
    const currentKeys = new Set(secrets.map((secret) => secret.key))
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

  const loadSecrets = async (include: boolean): Promise<boolean> => {
    if (!resolvedEnvironmentId) return false
    await queryClient.invalidateQueries({
      queryKey: queryKeys.secrets(resolvedEnvironmentId, include),
    })
    return true
  }

  const loadSecretCoverage = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.secretCoverage(projectId),
    })
  }

  const loadApprovals = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.approvals(projectId, 'PENDING', resolvedEnvironmentId),
    })
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
