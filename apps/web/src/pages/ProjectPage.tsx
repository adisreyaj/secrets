import type {
  ApiTokenDto,
  AuditLogDto,
  EnvironmentDto,
  ProjectDto,
  ProjectInviteDto,
  Role,
  SecretSearchResultDto,
} from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AuditLog } from '../components/AuditLog'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { ErrorBanner } from '../components/ErrorBanner'
import { Hero } from '../components/Hero'
import {
  ProjectsSection,
  type ProjectTemplate,
} from '../components/ProjectsSection'
import { SectionCard } from '../components/SectionCard'
import { TokensPanel } from '../components/TokensPanel'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDate, formatDateTime } from '../lib/format'
import { environmentPath, projectPath } from '../lib/paths'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ProjectPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
    reload: reloadProjects,
  } = useAsyncResource<ProjectDto[]>(
    async () => (user ? api.listProjects() : []),
    [user],
  )
  const {
    data: environmentsData,
    loading: envLoading,
    error: envError,
    reload: reloadEnvironments,
  } = useAsyncResource<EnvironmentDto[]>(
    async () => (user ? api.listEnvironments(projectId) : []),
    [projectId, user],
  )
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const environments = useMemo(() => environmentsData ?? [], [environmentsData])
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
    string | null
  >(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [searchEnvFilter, setSearchEnvFilter] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SecretSearchResultDto[]>(
    [],
  )
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const {
    data: auditLogsData,
    loading: auditLoading,
    error: auditError,
  } = useAsyncResource<AuditLogDto[]>(
    async () => (user ? api.listAudit(projectId) : []),
    [projectId, user],
  )
  const {
    data: tokensData,
    loading: tokensLoading,
    error: tokensError,
    reload: reloadTokens,
  } = useAsyncResource<ApiTokenDto[]>(
    async () => (user ? api.listTokens(projectId) : []),
    [projectId, user],
  )
  const auditLogs = auditLogsData ?? []
  const tokens = tokensData ?? []

  const {
    data: invitesData,
    loading: invitesLoading,
    error: invitesError,
    reload: reloadInvites,
  } = useAsyncResource<ProjectInviteDto[]>(
    async () => (user ? api.listInvites(projectId) : []),
    [projectId, user],
  )
  const invites = invitesData ?? []
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('VIEWER')
  const [inviteCreating, setInviteCreating] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)

  useEffect(() => {
    setSelectedEnvironmentId(null)
  }, [projectId])

  useEffect(() => {
    if (environments.length > 0) {
      setSelectedEnvironmentId((prev) => prev ?? environments[0].id)
    }
  }, [environments])

  useEffect(() => {
    if (!user) return
    const trimmed = deferredSearchQuery.trim()
    if (!trimmed) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    const handle = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const data = await api.searchProjectSecrets(projectId, {
          query: trimmed,
          environmentId: searchEnvFilter,
          includeValues: true,
        })
        setSearchResults(data)
      } catch (error) {
        setSearchError(getErrorMessage(error))
      } finally {
        setSearchLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [projectId, searchEnvFilter, deferredSearchQuery, user])

  const handleCreateProject = useCallback(
    async (payload: { name: string; template: ProjectTemplate }) => {
      const project = await api.createProject({ name: payload.name })
      const templates: Record<ProjectTemplate, string[]> = {
        starter: ['development', 'prod'],
        full: ['development', 'staging', 'prod'],
        empty: [],
      }

      const environments = templates[payload.template] ?? []
      if (environments.length > 0) {
        await Promise.all(
          environments.map((envName) =>
            api.createEnvironment(project.id, { name: envName }),
          ),
        )
      }
      await reloadProjects()
    },
    [reloadProjects],
  )

  const handleCreateEnvironment = useCallback(
    async (payload: {
      name: string
      copyFromEnvironmentId?: string | null
    }) => {
      await api.createEnvironment(projectId, {
        name: payload.name,
        copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
      })
      await reloadEnvironments()
    },
    [projectId, reloadEnvironments],
  )

  const handleCreateToken = useCallback(
    async (name: string, readOnly: boolean) => {
      const data = await api.createToken(projectId, { name, readOnly })
      await reloadTokens()
      return data
    },
    [projectId, reloadTokens],
  )

  const handleDeleteToken = useCallback(
    async (tokenId: string) => {
      await api.deleteToken(projectId, tokenId)
      await reloadTokens()
    },
    [projectId, reloadTokens],
  )

  const handleCreateInvite = useCallback(async () => {
    if (!inviteEmail.trim() || inviteCreating) return
    setInviteCreating(true)
    try {
      const data = await api.createInvite(projectId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      const link = `${window.location.origin}/invite?token=${encodeURIComponent(
        data.token,
      )}`
      setLastInviteLink(link)
      setInviteEmail('')
      await reloadInvites()
    } finally {
      setInviteCreating(false)
    }
  }, [inviteCreating, inviteEmail, inviteRole, projectId, reloadInvites])

  const handleRevokeInvite = useCallback(
    async (inviteId: string) => {
      await api.revokeInvite(projectId, inviteId)
      await reloadInvites()
    },
    [projectId, reloadInvites],
  )

  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null

  return (
    <section className="flex flex-col gap-10">
      <Hero
        title={selectedProject?.name ?? 'Project workspace'}
        subtitle="Track environments, issue access tokens, and keep audit trails across every secret change."
        stats={[
          { label: 'Environments', value: environments.length.toString() },
          { label: 'Audit events', value: auditLogs.length.toString() },
          { label: 'Tokens', value: tokens.length.toString() },
          { label: 'Project role', value: selectedProject?.role ?? 'Member' },
        ]}
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 gap-2 rounded-full px-6 py-3 text-sm font-semibold transition"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Button>
        }
      />

      <ProjectsSection
        projects={projects}
        selectedProjectId={projectId}
        loading={projectsLoading}
        error={projectsError}
        onSelect={(id) => {
          const project = projects.find((item) => item.id === id)
          navigate(projectPath(id, project?.slug))
        }}
        onCreate={handleCreateProject}
      />

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-foreground text-lg font-semibold">
              Global secret search
            </h3>
            <p className="text-muted-foreground text-xs">
              Search across all environments in this project.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.5fr]">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by key..."
          />
          <Select
            value={searchEnvFilter ?? 'all'}
            onValueChange={(value) =>
              setSearchEnvFilter(value === 'all' ? null : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All environments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All environments</SelectItem>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={searchEnvFilter ? 'outline' : 'default'}
            size="sm"
            className="rounded-full px-4 text-xs"
            onClick={() => setSearchEnvFilter(null)}
          >
            All
          </Button>
          {environments.map((env) => (
            <Button
              key={env.id}
              variant={searchEnvFilter === env.id ? 'default' : 'outline'}
              size="sm"
              className="rounded-full px-4 text-xs"
              onClick={() => setSearchEnvFilter(env.id)}
            >
              {env.name}
            </Button>
          ))}
        </div>

        {searchError ? (
          <ErrorBanner message={searchError} className="mt-4" />
        ) : null}

        <div className="mt-4 space-y-2">
          {searchLoading ? (
            <p className="text-muted-foreground text-sm">
              Searching secrets...
            </p>
          ) : searchQuery.trim().length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Start typing to search for keys across environments.
            </p>
          ) : searchResults.length === 0 ? (
            <p className="text-muted-foreground text-sm">No secrets matched.</p>
          ) : (
            searchResults.map((secret) => (
              <button
                key={secret.id}
                type="button"
                className="border-border bg-card/80 hover:border-foreground/20 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition"
                onClick={() =>
                  navigate(
                    environmentPath(
                      projectId,
                      selectedProject?.slug,
                      secret.environmentId,
                      environments.find(
                        (env) => env.id === secret.environmentId,
                      )?.slug,
                    ),
                  )
                }
              >
                <div>
                  <p className="text-foreground font-semibold">{secret.key}</p>
                  <p className="text-muted-foreground text-xs">
                    {secret.environmentName} · updated{' '}
                    {formatDateTime(secret.updatedAt)}
                  </p>
                </div>
                {secret.value ? (
                  <span className="text-muted-foreground text-xs">
                    {secret.value.slice(0, 48)}
                    {secret.value.length > 48 ? '…' : ''}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </SectionCard>

      <section>
        <EnvironmentsSection
          environments={environments}
          selectedEnvironmentId={selectedEnvironmentId}
          loading={envLoading}
          error={envError}
          missingCounts={{}}
          coverageLoading={false}
          onSelect={(environmentId) => {
            setSelectedEnvironmentId(environmentId)
            navigate(
              environmentPath(
                projectId,
                selectedProject?.slug,
                environmentId,
                environments.find((env) => env.id === environmentId)?.slug,
              ),
            )
          }}
          onCreate={handleCreateEnvironment}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <AuditLog
          audits={auditLogs}
          loading={auditLoading}
          error={auditError}
        />
        <TokensPanel
          tokens={tokens}
          loading={tokensLoading}
          error={tokensError}
          onCreate={handleCreateToken}
          onDelete={handleDeleteToken}
        />
      </section>

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-foreground text-lg font-semibold">
              Team invites
            </h3>
            <p className="text-muted-foreground text-xs">
              Invite teammates to this project workspace.
            </p>
          </div>
        </div>

        {invitesError && !invitesLoading ? (
          <ErrorBanner message={invitesError} className="mt-4" />
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.6fr_auto]">
          <Input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="teammate@company.com"
          />
          <Select
            value={inviteRole}
            onValueChange={(value) => setInviteRole(value as Role)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="EDITOR">Editor</SelectItem>
              <SelectItem value="VIEWER">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleCreateInvite}
            className="h-11 rounded-full px-6 text-sm font-semibold"
            disabled={inviteCreating || !inviteEmail.trim()}
          >
            {inviteCreating ? 'Inviting...' : 'Send invite'}
          </Button>
        </div>

        {lastInviteLink ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            Invite link (share privately):
            <div className="mt-2 font-mono text-[11px] break-all text-emerald-800">
              {lastInviteLink}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
            Pending invites
          </p>
          {invitesLoading ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Loading invites...
            </p>
          ) : invites.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No invites yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="border-border bg-card/80 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
                >
                  <div>
                    <p className="text-foreground font-semibold">
                      {invite.email}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {invite.role} · {invite.status} · expires{' '}
                      {formatDate(invite.expiresAt)}
                    </p>
                  </div>
                  {invite.status === 'PENDING' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-4 text-xs"
                      onClick={() => handleRevokeInvite(invite.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </section>
  )
}
