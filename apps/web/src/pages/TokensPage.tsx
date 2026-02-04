import type { ApiTokenDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { TokensPanel } from '../components/TokensPanel'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const TokensPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const { data: projectsData, error: projectsError } = useAsyncResource<
    ProjectDto[]
  >(async () => (user ? api.listProjects() : []), [user])
  const {
    data: tokensData,
    loading: tokensLoading,
    error: tokensError,
    reload: loadTokens,
  } = useAsyncResource<ApiTokenDto[]>(
    async () => (user ? api.listTokens(projectId) : []),
    [projectId, user],
  )
  const [lastToken, setLastToken] = useState<Awaited<
    ReturnType<typeof api.createToken>
  > | null>(null)
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const tokens = tokensData ?? []

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  const handleCreateToken = useCallback(
    async (name: string, readOnly: boolean) => {
      const data = await api.createToken(projectId, { name, readOnly })
      setLastToken(data)
      await loadTokens()
      return data
    },
    [projectId, loadTokens],
  )

  const handleDeleteToken = useCallback(
    async (tokenId: string) => {
      await api.deleteToken(projectId, tokenId)
      await loadTokens()
    },
    [projectId, loadTokens],
  )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="API tokens"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => navigate(`/projects/${projectId}`)}
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
        lastCreated={lastToken}
        onClearLastCreated={() => setLastToken(null)}
      />
    </section>
  )
}
