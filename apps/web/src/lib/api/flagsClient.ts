import type {
  FeatureFlagDto,
  FeatureFlagEnvironmentDiffDto,
  FeatureFlagMatrixRowDto,
  FeatureFlagSdkKeyDto,
} from '@secrets/shared'
import type { ApiFetchFn } from '../apiBase'

export const createFlagsClient = (apiFetch: ApiFetchFn) => ({
  listFlags: (projectId: string, environmentId?: string | null) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    return apiFetch<FeatureFlagDto[]>(
      `/projects/${projectId}/flags${params.size ? `?${params.toString()}` : ''}`,
    )
  },
  createFlag: (
    projectId: string,
    payload: {
      environmentId: string
      key: string
      description?: string | null
      valueType: 'BOOLEAN' | 'JSON'
      exposed?: boolean
      /** @deprecated use `exposed` */
      enabled: boolean
      runtime: 'both' | 'client' | 'server'
      labels: string[]
      booleanValue?: boolean | null
      jsonValue?: unknown
      environmentOverrides?: Array<{
        environmentId: string
        exposed?: boolean
        enabled?: boolean
        runtime?: 'both' | 'client' | 'server'
        labels?: string[]
        booleanValue?: boolean | null
        jsonValue?: unknown
      }>
    },
  ) =>
    apiFetch<FeatureFlagDto>(`/projects/${projectId}/flags`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getFlag: (
    flagId: string,
    environmentId?: string | null,
    includeAllEnvironments?: boolean,
  ) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    if (includeAllEnvironments) params.set('includeAllEnvironments', 'true')
    return apiFetch<FeatureFlagDto>(
      `/flags/${flagId}${params.size ? `?${params.toString()}` : ''}`,
    )
  },
  updateFlag: (
    flagId: string,
    payload: {
      environmentId: string
      key?: string
      description?: string | null
      valueType?: 'BOOLEAN' | 'JSON'
      exposed?: boolean
      /** @deprecated use `exposed` */
      enabled?: boolean
      runtime?: 'both' | 'client' | 'server'
      labels?: string[]
      booleanValue?: boolean | null
      jsonValue?: unknown
    },
  ) =>
    apiFetch<FeatureFlagDto>(`/flags/${flagId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteFlag: (flagId: string, environmentId: string) =>
    apiFetch<{ ok: true }>(`/flags/${flagId}`, {
      method: 'DELETE',
      body: JSON.stringify({ environmentId }),
    }),
  getFlagDiff: (
    flagId: string,
    fromEnvironmentId: string,
    toEnvironmentId: string,
  ) =>
    apiFetch<FeatureFlagEnvironmentDiffDto>(
      `/flags/${flagId}/diff?fromEnvironmentId=${encodeURIComponent(fromEnvironmentId)}&toEnvironmentId=${encodeURIComponent(toEnvironmentId)}`,
    ),
  getFlagsMatrix: (projectId: string) =>
    apiFetch<FeatureFlagMatrixRowDto[]>(`/projects/${projectId}/flags/matrix`),
  listFlagSdkKeys: (projectId: string, environmentId?: string | null) => {
    const params = new URLSearchParams()
    if (environmentId) params.set('environmentId', environmentId)
    return apiFetch<FeatureFlagSdkKeyDto[]>(
      `/projects/${projectId}/flag-sdk-keys${params.size ? `?${params.toString()}` : ''}`,
    )
  },
  createFlagSdkKey: (
    projectId: string,
    payload: {
      name: string
      environmentIds?: string[]
      expiresAt?: string | null
    },
  ) =>
    apiFetch<{ key: string; keyMeta: FeatureFlagSdkKeyDto }>(
      `/projects/${projectId}/flag-sdk-keys`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  rotateFlagSdkKey: (keyId: string, environmentIds?: string[]) =>
    apiFetch<{ key: string; keyMeta: FeatureFlagSdkKeyDto }>(
      `/flag-sdk-keys/${keyId}/rotate`,
      {
        method: 'POST',
        body: JSON.stringify(
          environmentIds ? { environmentIds } : {},
        ),
      },
    ),
  updateFlagSdkKey: (
    keyId: string,
    payload: { name?: string; environmentIds?: string[] },
  ) =>
    apiFetch<FeatureFlagSdkKeyDto>(`/flag-sdk-keys/${keyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  revokeFlagSdkKey: (keyId: string) =>
    apiFetch<{ ok: true }>(`/flag-sdk-keys/${keyId}`, { method: 'DELETE' }),
})
