import { useCallback, useEffect, useState } from 'react'
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
import { AuditLog } from '../components/AuditLog'
import { EnvironmentsSection } from '../components/EnvironmentsSection'
import { Hero } from '../components/Hero'
import { ProjectsSection, type ProjectTemplate } from '../components/ProjectsSection'
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
import { SectionCard } from '../components/SectionCard'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ProjectPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchEnvFilter, setSearchEnvFilter] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SecretSearchResultDto[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  const [tokens, setTokens] = useState<ApiTokenDto[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokensError, setTokensError] = useState<string | null>(null)
  const [lastToken, setLastToken] = useState<Awaited<ReturnType<typeof api.createToken>> | null>(null)

  const [invites, setInvites] = useState<ProjectInviteDto[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('VIEWER')
  const [inviteCreating, setInviteCreating] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  const loadEnvironments = useCallback(async () => {
    setEnvLoading(true)
    setEnvError(null)
    try {
      const data = await api.listEnvironments(projectId)
      setEnvironments(data)
      if (data.length > 0) {
        setSelectedEnvironmentId((prev) => prev ?? data[0].id)
      }
    } catch (error) {
      setEnvError(getErrorMessage(error))
    } finally {
      setEnvLoading(false)
    }
  }, [projectId])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    setAuditError(null)
    try {
      const data = await api.listAudit(projectId)
      setAuditLogs(data)
    } catch (error) {
      setAuditError(getErrorMessage(error))
    } finally {
      setAuditLoading(false)
    }
  }, [projectId])

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

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true)
    setInvitesError(null)
    try {
      const data = await api.listInvites(projectId)
      setInvites(data)
    } catch (error) {
      setInvitesError(getErrorMessage(error))
    } finally {
      setInvitesLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    setSelectedEnvironmentId(null)
  }, [projectId])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
      void loadAudit()
      void loadTokens()
      void loadInvites()
    }
  }, [user, projectId, loadProjects, loadEnvironments, loadAudit, loadTokens, loadInvites])

  useEffect(() => {
    if (!user) return
    const trimmed = searchQuery.trim()
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
  }, [projectId, searchEnvFilter, searchQuery, user])

  const handleCreateProject = async (payload: { name: string; template: ProjectTemplate }) => {
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
    await loadProjects()
  }

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => {
    await api.createEnvironment(projectId, {
      name: payload.name,
      copyFromEnvironmentId: payload.copyFromEnvironmentId || undefined,
    })
    await loadEnvironments()
  }

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

  const handleCreateInvite = async () => {
    if (!inviteEmail.trim() || inviteCreating) return
    setInviteCreating(true)
    try {
      const data = await api.createInvite(projectId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      const link = `${window.location.origin}${window.location.pathname}#/invite?token=${encodeURIComponent(
        data.token,
      )}`
      setLastInviteLink(link)
      setInviteEmail('')
      await loadInvites()
    } finally {
      setInviteCreating(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    await api.revokeInvite(projectId, inviteId)
    await loadInvites()
  }

  const selectedProject = projects.find((project) => project.id === projectId) ?? null

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
            className="gap-2 rounded-full border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:border-foreground/40"
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
        onSelect={(id) => navigate(`/projects/${id}`)}
        onCreate={handleCreateProject}
      />

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Global secret search</h3>
            <p className="text-xs text-muted-foreground">
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
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {searchError}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {searchLoading ? (
            <p className="text-sm text-muted-foreground">Searching secrets...</p>
          ) : searchQuery.trim().length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start typing to search for keys across environments.
            </p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No secrets matched.</p>
          ) : (
            searchResults.map((secret) => (
              <button
                key={secret.id}
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 py-3 text-left text-sm transition hover:border-foreground/20"
                onClick={() =>
                  navigate(
                    `/projects/${projectId}/environments/${secret.environmentId}`,
                  )
                }
              >
                <div>
                  <p className="font-semibold text-foreground">{secret.key}</p>
                  <p className="text-xs text-muted-foreground">
                    {secret.environmentName} · updated{' '}
                    {new Date(secret.updatedAt).toLocaleString()}
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
            navigate(`/projects/${projectId}/environments/${environmentId}`)
          }}
          onCreate={handleCreateEnvironment}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <AuditLog audits={auditLogs} loading={auditLoading} error={auditError} />
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

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Team invites</h3>
            <p className="text-xs text-muted-foreground">
              Invite teammates to this project workspace.
            </p>
          </div>
        </div>

        {(invitesError && !invitesLoading) ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {invitesError}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.6fr_auto]">
          <Input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="teammate@company.com"
          />
          <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as Role)}>
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Pending invites
          </p>
          {invitesLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading invites...</p>
          ) : invites.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invite.role} · {invite.status} · expires{' '}
                      {new Date(invite.expiresAt).toLocaleDateString()}
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
