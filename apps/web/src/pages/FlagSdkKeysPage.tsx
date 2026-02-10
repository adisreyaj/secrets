import type { FeatureFlagSdkKeyDto, ProjectDto } from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { projectPath } from '../lib/paths'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

type FlagSdkKeysPageProps = {
  projectId: string
  navigate: (path: string) => void
}

export const FlagSdkKeysPage = ({ projectId, navigate }: FlagSdkKeysPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const [name, setName] = useState('Client SDK key')
  const [lastIssuedKey, setLastIssuedKey] = useState<string | null>(null)

  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const { data: keysData, error: keysErrorRaw, isLoading: keysLoading } = useQuery<
    FeatureFlagSdkKeyDto[]
  >({
    queryKey: queryKeys.flagSdkKeys(projectId),
    queryFn: () => api.listFlagSdkKeys(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const projects = asArray(projectsData)
  const keys = asArray(keysData)
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () => navigate(projectPath(projectId, selectedProject?.slug, 'flags')))

  const createKey = async () => {
    if (!name.trim()) return
    const result = await runMutationWithToast(
      () => api.createFlagSdkKey(projectId, { name: name.trim() }),
      {
        successMessage: 'SDK key created.',
        onSuccess: async (created) => {
          setLastIssuedKey(created.key)
          await queryClient.invalidateQueries({
            queryKey: queryKeys.flagSdkKeys(projectId),
          })
        },
      },
    )
    if (result) {
      setName('Client SDK key')
    }
  }

  const rotateKey = async (keyId: string) => {
    await runMutationWithToast(
      () => api.rotateFlagSdkKey(keyId),
      {
        successMessage: 'SDK key rotated.',
        onSuccess: async (rotated) => {
          setLastIssuedKey(rotated.key)
          await queryClient.invalidateQueries({
            queryKey: queryKeys.flagSdkKeys(projectId),
          })
        },
      },
    )
  }

  const revokeKey = async (keyId: string) => {
    await runMutationWithToast(
      async () => {
        await api.revokeFlagSdkKey(keyId)
        await queryClient.invalidateQueries({
          queryKey: queryKeys.flagSdkKeys(projectId),
        })
      },
      { successMessage: 'SDK key revoked.' },
    )
  }

  const projectsError = projectsErrorRaw ? getErrorMessage(projectsErrorRaw) : null
  const keysError = keysErrorRaw ? getErrorMessage(keysErrorRaw) : null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Flag SDK keys"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(projectPath(projectId, selectedProject?.slug, 'flags'))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to flags
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || keysError) && (
        <ErrorBanner message={projectsError || keysError} />
      )}

      <SectionCard>
        <SectionHeader kicker="Create" title="Issue new SDK key" />
        <div className="mt-4 flex flex-wrap gap-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="SDK key name"
            className="max-w-sm"
          />
          <Button onClick={createKey}>Create key</Button>
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
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateKey(key.id)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Rotate
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
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </section>
  )
}
