import type { ApiTokenDto, ProjectDto } from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { TokensPanel } from '../components/TokensPanel'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

type TokensPageProps = {
  projectId: string
  navigate: (path: string) => void
}

export const TokensPage = ({ projectId, navigate }: TokensPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const {
    data: tokensData,
    isLoading: tokensLoading,
    error: tokensErrorRaw,
  } = useQuery<ApiTokenDto[]>({
    queryKey: queryKeys.tokens(projectId),
    queryFn: () => api.listTokens(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const projects = asArray(projectsData)
  const tokens = asArray(tokensData)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  const handleCreateToken = useCallback(
    async (name: string, readOnly: boolean) =>
      runMutationWithToast(
        async () => {
          const data = await api.createToken(projectId, { name, readOnly })
          await queryClient.invalidateQueries({
            queryKey: queryKeys.tokens(projectId),
          })
          return data
        },
        { successMessage: 'Token created.' },
      ),
    [projectId, queryClient],
  )

  const handleDeleteToken = useCallback(
    async (tokenId: string) =>
      Boolean(
        await runMutationWithToast(
        async () => {
          await api.deleteToken(projectId, tokenId)
          await queryClient.invalidateQueries({
            queryKey: queryKeys.tokens(projectId),
          })
        },
        { successMessage: 'Token deleted.' },
      )),
    [projectId, queryClient],
  )

  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null
  const tokensError = tokensErrorRaw ? getErrorMessage(tokensErrorRaw) : null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="API tokens"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              navigate(projectPath(projectId, selectedProject?.slug))
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || tokensError) && (
        <ErrorBanner message={projectsError || tokensError} />
      )}

      <TokensPanel
        tokens={tokens}
        loading={tokensLoading}
        error={tokensError}
        onCreate={handleCreateToken}
        onDelete={handleDeleteToken}
      />
    </section>
  )
}
