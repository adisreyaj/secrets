import type { ApiTokenDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { TokensPanel } from '../components/TokensPanel'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { projectPath } from '../lib/paths'
import { getErrorMessage } from '../lib/errors'
import { useRegisterShortcut } from '../lib/shortcuts'
import { queryKeys } from '../lib/queryKeys'
import { useRequireAuth } from '../lib/useRequireAuth'
import { toast } from 'sonner'

export const TokensPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
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
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const tokens = tokensData ?? []

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  const handleCreateToken = useCallback(
    async (name: string, readOnly: boolean) => {
      try {
        const data = await api.createToken(projectId, { name, readOnly })
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tokens(projectId),
        })
        toast.success('Token created.')
        return data
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
    [projectId, queryClient],
  )

  const handleDeleteToken = useCallback(
    async (tokenId: string) => {
      try {
        await api.deleteToken(projectId, tokenId)
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tokens(projectId),
        })
        toast.success('Token deleted.')
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
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
            className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
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
