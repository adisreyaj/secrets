import type {
  ApprovalRequestDto,
  EnvironmentDto,
  ProjectDto,
  SecretDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { downloadTextFile, buildEnvFilename, buildSecretsCsv, slugify } from '../../lib/download'
import { getErrorMessage } from '../../lib/errors'
import { queryKeys } from '../../lib/queryKeys'
import { asArray } from '../../lib/queryResult'
import { createEnvironmentMutations } from '../../features/environment/mutations'
import {
  buildEnvironmentOptions,
  buildMissingKeys,
  buildMissingKeysByEnvironment,
  buildPendingBySecretId,
  buildSecretByKey,
} from '../../features/environment/selectors'

type UseEnvironmentDataProps = {
  projectId: string
  environmentId: string
  enabled: boolean
}

export const useEnvironmentData = ({
  projectId,
  environmentId,
  enabled,
}: UseEnvironmentDataProps) => {
  const queryClient = useQueryClient()

  const {
    data: projectsData,
    error: projectsErrorRaw,
  } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled,
  })

  const projects = asArray(projectsData)

  const {
    data: environmentsData,
    isLoading: envLoading,
    error: envErrorRaw,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: enabled && Boolean(projectId),
  })

  const environments = asArray(environmentsData)

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

  const approvals = asArray(approvalsData)

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
      return Object.fromEntries(entries)
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

  const {
    handleCreateEnvironment,
    handleCreateSecret,
    handleUpdateSecrets,
    handleRollbackSecret,
    handleDeleteSecret,
    handleCopySecret,
    handleCopyMissingSecrets,
  } = createEnvironmentMutations({
    queryClient,
    projectId,
    environmentId: resolvedEnvironmentId,
    valuesLoaded,
  })

  const handleDiffSecret = async (
    secretId: string,
    versions?: { from?: string; to?: string },
  ) => {
    return api.getSecretDiff(secretId, versions)
  }

  const handleListSecretVersions = async (secretId: string) => {
    return api.listSecretVersions(secretId)
  }

  const selectedEnvironment =
    environments.find((env) => env.id === (resolvedEnvironmentId ?? environmentId)) ??
    null
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null

  const environmentOptions = useMemo(
    () => buildEnvironmentOptions(environments),
    [environments],
  )

  const missingKeys = useMemo(
    () => buildMissingKeys(secretKeyIndex, secrets),
    [secretKeyIndex, secrets],
  )

  const missingKeysByEnvironment = useMemo(
    () =>
      buildMissingKeysByEnvironment(
        environments,
        resolvedEnvironmentId ?? environmentId,
        secretKeyIndex,
        secrets,
      ),
    [environmentId, environments, resolvedEnvironmentId, secretKeyIndex, secrets],
  )

  const secretByKey = useMemo(() => buildSecretByKey(secrets), [secrets])

  const pendingBySecretId = useMemo(
    () => buildPendingBySecretId(approvals),
    [approvals],
  )

  const handleExportEnv = async () => {
    if (!selectedEnvironment) return
    const content = await api.exportEnv(selectedEnvironment.id)
    const filename = buildEnvFilename(
      selectedProject?.name,
      projectId,
      selectedEnvironment.name,
      selectedEnvironment.id,
    )
    downloadTextFile(content, filename, 'text/plain')
  }

  const handleExportCsv = () => {
    if (!selectedEnvironment) return

    const content = buildSecretsCsv(
      secrets.map((secret) => ({
        key: secret.key,
        value: valuesLoaded ? (secret.value ?? '') : '',
        updatedAt: secret.updatedAt,
      })),
    )
    downloadTextFile(
      content,
      `${slugify(selectedEnvironment.name)}-secrets.csv`,
      'text/csv',
    )
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
