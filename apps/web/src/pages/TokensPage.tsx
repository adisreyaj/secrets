import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiTokenDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { TokensPanel } from '../components/TokensPanel'
import { Button } from '../components/ui/button'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRegisterShortcut } from '../lib/shortcuts'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const TokensPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [tokens, setTokens] = useState<ApiTokenDto[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokensError, setTokensError] = useState<string | null>(null)
  const [lastToken, setLastToken] = useState<Awaited<ReturnType<typeof api.createToken>> | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  const loadProjects = useCallback(async () => {
    setProjectsError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    }
  }, [])

  const loadTokens = useCallback(async () => {
    setTokensLoading(true)
    setTokensError(null)
    try {
      const data = await api.listTokens(projectId)
      setTokens(data)
    } catch (error) {
      setTokensError(getErrorMessage(error))
    } finally {
      setTokensLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadTokens()
    }
  }, [user, loadProjects, loadTokens])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  const handleCreateToken = async (name: string, readOnly: boolean) => {
    const data = await api.createToken(projectId, { name, readOnly })
    setLastToken(data)
    await loadTokens()
    return data
  }

  const handleDeleteToken = async (tokenId: string) => {
    await api.deleteToken(projectId, tokenId)
    await loadTokens()
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="API tokens"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="flex items-center gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || tokensError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || tokensError}
        </div>
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
