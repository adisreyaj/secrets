import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { getErrorMessage } from '../../lib/errors'
import { queryKeys } from '../../lib/queryKeys'

type EnvironmentMutationsConfig = {
  queryClient: QueryClient
  projectId: string
  environmentId: string
  valuesLoaded: boolean
}

export const createEnvironmentMutations = ({
  queryClient,
  projectId,
  environmentId,
  valuesLoaded,
}: EnvironmentMutationsConfig) => {
  const loadApprovals = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.approvals(projectId, 'PENDING', environmentId),
    })
  }

  const loadSecrets = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.secrets(environmentId, valuesLoaded),
    })
  }

  const loadSecretCoverage = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.secretCoverage(projectId),
    })
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
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    }
  }

  const handleCreateSecret = async (payload: { key: string; value: string }) => {
    try {
      const result = await api.createSecret(environmentId, payload)
      if ('status' in result && result.status === 'pending') {
        await loadApprovals()
        toast.info('Approval requested for secret.')
        return true
      }
      await loadSecrets()
      await loadSecretCoverage()
      toast.success('Secret created.')
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
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
          await loadApprovals()
          continue
        }
      }
      await loadSecrets()
      if (keyUpdated) {
        await loadSecretCoverage()
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
        await loadApprovals()
        toast.info('Rollback submitted for approval.')
        return true
      }
      await loadSecrets()
      toast.success('Secret rolled back.')
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    }
  }

  const handleDeleteSecret = async (secretId: string) => {
    try {
      const result = await api.deleteSecret(secretId)
      if ('status' in result && result.status === 'pending') {
        await loadApprovals()
        toast.info('Delete submitted for approval.')
        return true
      }
      await loadSecrets()
      await loadSecretCoverage()
      toast.success('Secret deleted.')
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    }
  }

  const handleCopySecret = async (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => {
    try {
      const result = await api.copySecret(secretId, payload)
      if ('status' in result && result.status === 'pending') {
        await loadApprovals()
        toast.info('Copy submitted for approval.')
        return result
      }
      await loadSecretCoverage()
      if ('created' in result) {
        const total = result.created.length + result.updated.length
        toast.success(`Copied to ${total} environment${total === 1 ? '' : 's'}.`)
      }
      return result
    } catch (error) {
      toast.error(getErrorMessage(error))
      return undefined
    }
  }

  const handleCopyMissingSecrets = async (
    sourceEnvironmentId: string,
    keys: string[],
    overwrite: boolean,
  ) => {
    try {
      const result = await api.copySecretsFromEnvironment(environmentId, {
        sourceEnvironmentId,
        keys,
        overwrite,
      })
      if ('status' in result && result.status === 'pending') {
        await loadApprovals()
        return result
      }
      await loadSecretCoverage()
      await loadSecrets()
      return result
    } catch (error) {
      toast.error(getErrorMessage(error))
      return undefined
    }
  }

  return {
    handleCreateEnvironment,
    handleCreateSecret,
    handleUpdateSecrets,
    handleRollbackSecret,
    handleDeleteSecret,
    handleCopySecret,
    handleCopyMissingSecrets,
  }
}
