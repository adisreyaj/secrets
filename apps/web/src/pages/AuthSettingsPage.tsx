import type { AuthProviderDto, ProjectDto } from '@secrets/shared'
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
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { getProjectModuleState } from '../lib/modules'
import { projectPath } from '../lib/paths'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

type AuthSettingsPageProps = {
  projectId: string
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

type FormState = {
  nativeAuthEnabled: boolean
  emailPasswordEnabled: boolean
  accessTokenTtlMinutes: string
  refreshTokenTtlDays: string
}

type ProviderFormState = {
  provider: 'google' | 'github'
  enabled: boolean
  clientId: string
  clientSecret: string
  scopes: string
}

const DEFAULT_PROVIDER_FORM: ProviderFormState = {
  provider: 'google',
  enabled: true,
  clientId: '',
  clientSecret: '',
  scopes: 'openid,email,profile',
}

export const AuthSettingsPage = ({ projectId, navigate }: AuthSettingsPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerForm, setProviderForm] = useState<ProviderFormState>(
    DEFAULT_PROVIDER_FORM,
  )
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)

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

  const projects = asArray(projectsData)
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const isAdmin = selectedProject?.role === 'ADMIN'
  const moduleState = useMemo(() => getProjectModuleState(modulesData), [modulesData])
  const providers = asArray(providersData)

  useEffect(() => {
    if (!configData) return
    setForm({
      nativeAuthEnabled: configData.nativeAuthEnabled,
      emailPasswordEnabled: configData.emailPasswordEnabled,
      accessTokenTtlMinutes: String(configData.accessTokenTtlMinutes),
      refreshTokenTtlDays: String(configData.refreshTokenTtlDays),
    })
  }, [configData])

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  const saveConfig = async () => {
    if (!form || saving) return
    const accessTokenTtlMinutes = Number(form.accessTokenTtlMinutes)
    const refreshTokenTtlDays = Number(form.refreshTokenTtlDays)
    if (
      !Number.isFinite(accessTokenTtlMinutes) ||
      !Number.isFinite(refreshTokenTtlDays) ||
      accessTokenTtlMinutes < 1 ||
      refreshTokenTtlDays < 1
    ) {
      return
    }

    setSaving(true)
    try {
      await runMutationWithToast(
        async () => {
          await api.updateAuthConfig(projectId, {
            nativeAuthEnabled: form.nativeAuthEnabled,
            emailPasswordEnabled: form.emailPasswordEnabled,
            accessTokenTtlMinutes,
            refreshTokenTtlDays,
          })
          await queryClient.invalidateQueries({ queryKey: queryKeys.authConfig(projectId) })
        },
        { successMessage: 'Auth settings updated.' },
      )
    } finally {
      setSaving(false)
    }
  }

  const resetProviderForm = () => {
    setProviderForm(DEFAULT_PROVIDER_FORM)
    setEditingProviderId(null)
  }

  const startEditProvider = (provider: AuthProviderDto) => {
    setEditingProviderId(provider.id)
    setProviderForm({
      provider: provider.provider,
      enabled: provider.enabled,
      clientId: provider.clientId,
      clientSecret: '',
      scopes: provider.scopes.join(','),
    })
  }

  const saveProvider = async () => {
    if (!isAdmin || providerSaving) return
    const clientId = providerForm.clientId.trim()
    if (!clientId) return
    const scopes = providerForm.scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0)
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
          await queryClient.invalidateQueries({
            queryKey: queryKeys.authProviders(projectId),
          })
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

  const projectsError = projectsErrorRaw ? getErrorMessage(projectsErrorRaw) : null
  const configError = configErrorRaw ? getErrorMessage(configErrorRaw) : null
  const providersError = providersErrorRaw ? getErrorMessage(providersErrorRaw) : null

  if (!moduleState.auth) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Auth settings"
          subtitle="Enable the Auth module for this project to manage runtime authentication."
          actions={
            <Button
              variant="outline"
              onClick={() => navigate(projectPath(projectId, selectedProject?.slug))}
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
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(projectPath(projectId, selectedProject?.slug))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || configError || providersError) && (
        <ErrorBanner message={projectsError || configError || providersError} />
      )}

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
          </div>
        )}
      </SectionCard>
    </section>
  )
}
