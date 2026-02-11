import type { QueryClient } from '@tanstack/react-query'
import { api } from './api'
import { invalidateQueryKeys } from './queryInvalidation'
import { queryKeys } from './queryKeys'

type CreateEnvironmentPayload = {
  name: string
  copyFromEnvironmentId?: string | null
}

export const createEnvironmentAndRefresh = async (
  queryClient: QueryClient,
  projectId: string,
  payload: CreateEnvironmentPayload,
) => {
  try {
    await api.createEnvironment(projectId, {
      name: payload.name,
      copyFromEnvironmentId: payload.copyFromEnvironmentId ?? undefined,
    })
    await invalidateQueryKeys(queryClient, queryKeys.environments(projectId))
    return true
  } catch {
    return false
  }
}
