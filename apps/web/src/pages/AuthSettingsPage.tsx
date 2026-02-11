import type {
  AuditLogDto,
  AuthClientDto,
  AuthProviderDto,
  EnvironmentDto,
  ProjectDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api } from '../lib/api'
import { createEnvironmentAndRefresh } from '../lib/environmentMutations'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { getProjectModuleState } from '../lib/modules'
import {
  authEnvironmentPath,
  authEnvironmentsPath,
  projectPath,
} from '../lib/paths'
import { humanizeAction, humanizeResourceType } from '../features/audit/labels'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { invalidateQueryKeys } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { getLastEnvironmentId } from '../lib/shortcuts.utils'
import { useRequireAuth } from '../lib/useRequireAuth'
import {
  mapAuthConfigToFormState,
  parseAuthConfigTtl,
  type AuthConfigFormState,
} from './AuthSettingsPage.configForm'
import {
  createProviderFormFromProvider,
  defaultProviderFormState,
  parseProviderScopes,
  type ProviderFormState,
} from './AuthSettingsPage.providerForm'
import { EnvironmentTabsCard } from './environment/EnvironmentTabsCard'

type AuthSettingsPageProps = {
  projectId: string
  environmentId: string
  navigate: (path: string) => void
}

type AuthConfigResponse = {
  projectId: string
  nativeAuthEnabled: boolean
  emailPasswordEnabled: boolean
  accessTokenTtlMinutes: number
  refreshTokenTtlDays: number
  createdAt: string
  updatedAt: string
}

export const AuthSettingsPage = ({
  projectId,
  environmentId,
  navigate,
}: AuthSettingsPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AuthConfigFormState | null>(null)
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerForm, setProviderForm] = useState<ProviderFormState>(
    defaultProviderFormState,
  )
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerRotateId, setProviderRotateId] = useState<string | null>(null)
  const [providerRotateSecret, setProviderRotateSecret] = useState('')
  const [clientRotateId, setClientRotateId] = useState<string | null>(null)
  const [revealedClientSecret, setRevealedClientSecret] = useState<{
    clientId: string
    clientSecret: string
  } | null>(null)

  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const { data: modulesData } = useQuery({
    queryKey: queryKeys.projectModules(projectId),
    queryFn: () => api.listProjectModules(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const {
    data: environmentsData,
    error: environmentsErrorRaw,
    isLoading: environmentsLoading,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const {
    data: configData,
    error: configErrorRaw,
    isLoading: configLoading,
  } = useQuery<AuthConfigResponse>({
    queryKey: queryKeys.authConfig(projectId),
    queryFn: () => api.getAuthConfig(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const {
    data: providersData,
    error: providersErrorRaw,
    isLoading: providersLoading,
  } = useQuery<AuthProviderDto[]>({
    queryKey: queryKeys.authProviders(projectId),
    queryFn: () => api.listAuthProviders(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const {
    data: clientsData,
    error: clientsErrorRaw,
    isLoading: clientsLoading,
  } = useQuery<AuthClientDto[]>({
    queryKey: queryKeys.authClients(projectId),
    queryFn: () => api.listAuthClients(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const {
    data: auditLogsData,
    error: auditErrorRaw,
    isLoading: auditLoading,
  } = useQuery<AuditLogDto[]>({
    queryKey: queryKeys.audit(projectId, 'auth-module'),
    queryFn: () => api.listAudit(projectId, { limit: 80 }),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const projects = asArray(projectsData)
  const environments = asArray(environmentsData)
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const selectedEnvironment = useMemo(
    () => environments.find((env) => env.id === environmentId) ?? null,
    [environments, environmentId],
  )
  const isAdmin = selectedProject?.role === 'ADMIN'
  const moduleState = useMemo(() => getProjectModuleState(modulesData), [modulesData])
  const providers = asArray(providersData)
  const clients = asArray(clientsData)
  const authAuditLogs = useMemo(
    () =>
      asArray(auditLogsData).filter(
        (audit) =>
          audit.action.startsWith('auth.') ||
          audit.resourceType.startsWith('auth_') ||
          (audit.metadataJson &&
            typeof audit.metadataJson === 'object' &&
            (audit.metadataJson as { module?: string }).module === 'auth'),
      ),
    [auditLogsData],
  )

  useEffect(() => {
    if (!configData) return
    setForm(mapAuthConfigToFormState(configData))
  }, [configData])

  useEffect(() => {
    if (!projectId || environmentsLoading || environments.length === 0 || selectedEnvironment) {
      return
    }
    const fallbackEnvironmentId = getLastEnvironmentId(projectId)
    const fallback =
      environments.find((env) => env.id === fallbackEnvironmentId) ??
      environments[0]
    if (!fallback) return
    navigate(authEnvironmentPath(projectId, selectedProject?.slug, fallback.id))
  }, [
    projectId,
    environments,
    environmentsLoading,
    selectedEnvironment,
    navigate,
    selectedProject?.slug,
  ])

  useRegisterShortcut('b', () =>
    navigate(authEnvironmentsPath(projectId, selectedProject?.slug)),
  )

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => createEnvironmentAndRefresh(queryClient, projectId, payload)

  const saveConfig = async () => {
    if (!form || saving) return
    const ttlValues = parseAuthConfigTtl(form)
    if (!ttlValues) return

    setSaving(true)
    try {
      await runMutationWithToast(
        async () => {
          await api.updateAuthConfig(projectId, {
            nativeAuthEnabled: form.nativeAuthEnabled,
            emailPasswordEnabled: form.emailPasswordEnabled,
            accessTokenTtlMinutes: ttlValues.accessTokenTtlMinutes,
            refreshTokenTtlDays: ttlValues.refreshTokenTtlDays,
          })
          await invalidateQueryKeys(queryClient, queryKeys.authConfig(projectId))
        },
        { successMessage: 'Auth settings updated.' },
      )
    } finally {
      setSaving(false)
    }
  }

  const resetProviderForm = () => {
    setProviderForm(defaultProviderFormState)
    setEditingProviderId(null)
  }

  const startEditProvider = (provider: AuthProviderDto) => {
    setEditingProviderId(provider.id)
    setProviderForm(createProviderFormFromProvider(provider))
  }

  const saveProvider = async () => {
    if (!isAdmin || providerSaving) return
    const clientId = providerForm.clientId.trim()
    if (!clientId) return
    const scopes = parseProviderScopes(providerForm.scopes)
    setProviderSaving(true)
    try {
      await runMutationWithToast(
        async () => {
          if (editingProviderId) {
            await api.updateAuthProvider(editingProviderId, {
              enabled: providerForm.enabled,
              clientId,
              scopes,
            })
          } else {
            const clientSecret = providerForm.clientSecret.trim()
            if (!clientSecret) {
              throw new Error('Client secret is required for new providers')
            }
            await api.createAuthProvider(projectId, {
              provider: providerForm.provider,
              enabled: providerForm.enabled,
              clientId,
              clientSecret,
              scopes,
            })
          }
          await invalidateQueryKeys(queryClient, queryKeys.authProviders(projectId))
          resetProviderForm()
        },
        {
          successMessage: editingProviderId
            ? 'Provider updated.'
            : 'Provider configured.',
        },
      )
    } finally {
      setProviderSaving(false)
    }
  }

  const rotateProviderSecret = async () => {
    if (!providerRotateId || !providerRotateSecret.trim() || !isAdmin) return
    await runMutationWithToast(
      async () => {
        await api.rotateAuthProviderSecret(providerRotateId, providerRotateSecret.trim())
        await invalidateQueryKeys(queryClient, queryKeys.authProviders(projectId))
      },
      { successMessage: 'Provider secret rotated.' },
    )
    setProviderRotateId(null)
    setProviderRotateSecret('')
  }

  const rotateClientSecret = async (clientId: string) => {
    if (!isAdmin || clientRotateId) return
    setClientRotateId(clientId)
    try {
      await runMutationWithToast(
        async () => {
          const result = await api.updateAuthClient(clientId, { rotateSecret: true })
          if (result.clientSecret) {
            setRevealedClientSecret({
              clientId,
              clientSecret: result.clientSecret,
            })
          }
          await invalidateQueryKeys(
            queryClient,
            queryKeys.authClients(projectId),
            queryKeys.audit(projectId),
          )
        },
        { successMessage: 'Client secret rotated.' },
      )
    } finally {
      setClientRotateId(null)
    }
  }

  const projectsError = projectsErrorRaw ? getErrorMessage(projectsErrorRaw) : null
  const configError = configErrorRaw ? getErrorMessage(configErrorRaw) : null
  const providersError = providersErrorRaw ? getErrorMessage(providersErrorRaw) : null
  const clientsError = clientsErrorRaw ? getErrorMessage(clientsErrorRaw) : null
  const auditError = auditErrorRaw ? getErrorMessage(auditErrorRaw) : null
  const environmentsError = environmentsErrorRaw ? getErrorMessage(environmentsErrorRaw) : null

  if (!moduleState.auth) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Auth settings"
          subtitle="Enable the Auth module for this project to manage runtime authentication."
          actions={
            <Button
              variant="outline"
              onClick={() =>
                navigate(authEnvironmentsPath(projectId, selectedProject?.slug))
              }
            >
              <ArrowLeft className="h-4 w-4" />
              Back to overview
              <ShortcutHint keys="b" />
            </Button>
          }
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Auth settings"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}${selectedEnvironment ? ` · Environment: ${selectedEnvironment.name}` : ''}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              navigate(authEnvironmentsPath(projectId, selectedProject?.slug))
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError ||
        configError ||
        providersError ||
        clientsError ||
        auditError ||
        environmentsError) && (
        <ErrorBanner
          message={
            projectsError ||
            configError ||
            providersError ||
            clientsError ||
            auditError ||
            environmentsError
          }
        />
      )}

      <section className="flex flex-col gap-0">
        <EnvironmentTabsCard
          environments={environments}
          envLoading={environmentsLoading}
          environmentId={environmentId}
          onSelectEnvironment={(envId) =>
            navigate(authEnvironmentPath(projectId, selectedProject?.slug, envId))
          }
          environmentOptions={environments.map((env) => ({
            id: env.id,
            name: env.name,
          }))}
          onCreateEnvironment={handleCreateEnvironment}
        />
      </section>

      <SectionCard>
        <SectionHeader
          kicker="Configuration"
          title="Core auth policy"
          action={
            <Button onClick={saveConfig} disabled={!isAdmin || !form || saving}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          }
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Configure local auth and token lifetime policy for this project.
        </p>

        {configLoading || !form ? (
          <p className="text-muted-foreground mt-4 text-sm">Loading auth config...</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="border-border bg-card flex items-start gap-3 rounded-xl border p-3">
              <Checkbox
                checked={form.nativeAuthEnabled}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current
                      ? { ...current, nativeAuthEnabled: checked === true }
                      : current,
                  )
                }
                disabled={!isAdmin}
              />
              <span className="space-y-1">
                <span className="text-foreground block text-sm font-medium">
                  Native auth enabled
                </span>
                <span className="text-muted-foreground block text-xs">
                  Allows runtime signup/login flows for end users.
                </span>
              </span>
            </label>

            <label className="border-border bg-card flex items-start gap-3 rounded-xl border p-3">
              <Checkbox
                checked={form.emailPasswordEnabled}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current
                      ? { ...current, emailPasswordEnabled: checked === true }
                      : current,
                  )
                }
                disabled={!isAdmin}
              />
              <span className="space-y-1">
                <span className="text-foreground block text-sm font-medium">
                  Email/password enabled
                </span>
                <span className="text-muted-foreground block text-xs">
                  Enables local identity login with password credentials.
                </span>
              </span>
            </label>

            <div className="grid gap-2">
              <p className="muted-label">Access token TTL (minutes)</p>
              <Input
                value={form.accessTokenTtlMinutes}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, accessTokenTtlMinutes: event.target.value }
                      : current,
                  )
                }
                disabled={!isAdmin}
                inputMode="numeric"
              />
            </div>

            <div className="grid gap-2">
              <p className="muted-label">Refresh token TTL (days)</p>
              <Input
                value={form.refreshTokenTtlDays}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, refreshTokenTtlDays: event.target.value }
                      : current,
                  )
                }
                disabled={!isAdmin}
                inputMode="numeric"
              />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <SectionHeader
          kicker="Providers"
          title="Provider config"
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Configure provider credentials, scopes, and signup policy toggles.
        </p>

        {providersLoading ? (
          <p className="text-muted-foreground mt-4 text-sm">Loading providers...</p>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              {providers.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No providers configured yet.
                </p>
              ) : (
                providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="border-border bg-card flex items-center justify-between rounded-xl border p-3"
                  >
                    <div>
                      <p className="text-foreground text-sm font-medium capitalize">
                        {provider.provider}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Client ID: {provider.clientId}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Scopes: {provider.scopes.join(', ') || 'default'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <p className="text-foreground text-xs font-medium">
                        {provider.enabled ? 'Enabled' : 'Disabled'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Updated {formatDate(provider.updatedAt)}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditProvider(provider)}
                        disabled={!isAdmin}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-border bg-card rounded-xl border p-4">
              <p className="text-foreground text-sm font-medium">
                {editingProviderId ? 'Edit provider' : 'Add provider'}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <p className="muted-label">Provider</p>
                  <Select
                    value={providerForm.provider}
                    onValueChange={(value) =>
                      setProviderForm((current) => ({
                        ...current,
                        provider: value as 'google' | 'github',
                      }))
                    }
                    disabled={!isAdmin || Boolean(editingProviderId)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="github">GitHub</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <p className="muted-label">Client ID</p>
                  <Input
                    value={providerForm.clientId}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        clientId: event.target.value,
                      }))
                    }
                    disabled={!isAdmin}
                  />
                </div>
                <div className="grid gap-2">
                  <p className="muted-label">
                    Client secret
                    {editingProviderId ? ' (leave blank to keep current)' : ''}
                  </p>
                  <Input
                    type="password"
                    value={providerForm.clientSecret}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        clientSecret: event.target.value,
                      }))
                    }
                    disabled={!isAdmin || Boolean(editingProviderId)}
                    placeholder={editingProviderId ? '••••••••' : ''}
                  />
                </div>
                <div className="grid gap-2">
                  <p className="muted-label">Scopes (comma separated)</p>
                  <Input
                    value={providerForm.scopes}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        scopes: event.target.value,
                      }))
                    }
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm">
                <Checkbox
                  checked={providerForm.enabled}
                  onCheckedChange={(checked) =>
                    setProviderForm((current) => ({
                      ...current,
                      enabled: checked === true,
                    }))
                  }
                  disabled={!isAdmin}
                />
                Enable provider
              </label>

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={saveProvider}
                  disabled={!isAdmin || providerSaving}
                >
                  {editingProviderId ? 'Update provider' : 'Create provider'}
                </Button>
                {editingProviderId ? (
                  <Button
                    variant="outline"
                    onClick={resetProviderForm}
                    disabled={providerSaving}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>

            {providerRotateId ? (
              <div className="border-border bg-card rounded-xl border p-4">
                <p className="text-foreground text-sm font-medium">
                  Rotate provider secret
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Enter the new provider secret. Existing secret is never shown.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <Input
                    type="password"
                    value={providerRotateSecret}
                    onChange={(event) => setProviderRotateSecret(event.target.value)}
                    placeholder="New client secret"
                    disabled={!isAdmin}
                  />
                  <Button
                    onClick={rotateProviderSecret}
                    disabled={!isAdmin || providerSaving}
                  >
                    Rotate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setProviderRotateId(null)
                      setProviderRotateSecret('')
                    }}
                    disabled={providerSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {providers.map((provider) => (
                  <Button
                    key={`${provider.id}-rotate`}
                    variant="outline"
                    size="sm"
                    onClick={() => setProviderRotateId(provider.id)}
                    disabled={!isAdmin}
                  >
                    Rotate {provider.provider} secret
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Clients" title="Runtime auth clients" />
        <p className="text-muted-foreground mt-2 text-sm">
          Rotate confidential client secrets and review client credential posture.
        </p>

        {clientsLoading ? (
          <p className="text-muted-foreground mt-4 text-sm">Loading auth clients...</p>
        ) : clients.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            No auth clients configured yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {clients.map((client) => (
              <div
                key={client.id}
                className="border-border bg-card flex items-center justify-between rounded-xl border p-3"
              >
                <div>
                  <p className="text-foreground text-sm font-medium">{client.name}</p>
                  <p className="text-muted-foreground text-xs">Client ID: {client.clientId}</p>
                  <p className="text-muted-foreground text-xs capitalize">
                    Type: {client.type}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {client.type === 'confidential' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateClientSecret(client.id)}
                      disabled={!isAdmin || clientRotateId === client.id}
                    >
                      Rotate secret
                    </Button>
                  ) : (
                    <p className="text-muted-foreground text-xs">Public client</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {revealedClientSecret ? (
          <div className="border-border bg-card mt-4 rounded-xl border p-4">
            <p className="text-foreground text-sm font-medium">New client secret</p>
            <p className="text-muted-foreground mt-1 text-xs">
              This secret is shown once after rotation. Store it now.
            </p>
            <Input
              className="mt-3 font-mono text-xs"
              value={revealedClientSecret.clientSecret}
              readOnly
            />
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevealedClientSecret(null)}
              >
                Hide
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard>
        <SectionHeader
          kicker="Audit"
          title="Auth activity"
          action={
            <Button
              variant="outline"
              onClick={() =>
                navigate(projectPath(projectId, selectedProject?.slug, 'audit'))
              }
            >
              Open full audit log
            </Button>
          }
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Recent auth-related events from project audit logs.
        </p>

        {auditLoading ? (
          <p className="text-muted-foreground mt-4 text-sm">Loading auth audit events...</p>
        ) : authAuditLogs.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            No auth audit events found yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {authAuditLogs.slice(0, 20).map((audit) => (
              <div
                key={audit.id}
                className="border-border bg-card flex items-start justify-between rounded-xl border p-3"
              >
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {humanizeAction(audit.action)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {humanizeResourceType(audit.resourceType)} ·{' '}
                    {audit.resourceId?.slice(0, 12) ?? '—'}
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatDate(audit.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </section>
  )
}
