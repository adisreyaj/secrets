import type {
  EnvironmentDto,
  ProjectDto,
  ServiceAccountDto,
  ServiceAccountTokenDto,
} from '@secrets/shared'
import { ArrowLeft, Copy, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import { api } from '../lib/api'
import { projectPath } from '../lib/paths'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { useRegisterShortcut } from '../lib/shortcuts'
import { queryKeys } from '../lib/queryKeys'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ServiceAccountsPage = ({
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

  const { data: environmentsData, error: envErrorRaw } =
    useQuery<EnvironmentDto[]>({
      queryKey: queryKeys.environments(projectId),
      queryFn: () => api.listEnvironments(projectId),
      enabled: Boolean(user) && Boolean(projectId),
    })

  const {
    data: accountsData,
    isLoading: accountsLoading,
    error: accountsErrorRaw,
  } = useQuery<{
    accounts: ServiceAccountDto[]
    tokensByAccount: Record<string, ServiceAccountTokenDto[]>
  }>({
    queryKey: queryKeys.serviceAccounts(projectId),
    queryFn: async () => {
      const accounts = await api.listServiceAccounts(projectId)
      const tokens = await Promise.all(
        accounts.map(async (account) => {
          const list = await api.listServiceAccountTokens(account.id)
          return [account.id, list] as const
        }),
      )
      return { accounts, tokensByAccount: Object.fromEntries(tokens) }
    },
    enabled: Boolean(user) && Boolean(projectId),
  })

  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const environments = environmentsData ?? []
  const accounts = accountsData?.accounts ?? []
  const tokensByAccount = accountsData?.tokensByAccount ?? {}

  const [createName, setCreateName] = useState('')
  const [createEnvIds, setCreateEnvIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [tokenAccount, setTokenAccount] = useState<ServiceAccountDto | null>(
    null,
  )
  const [tokenName, setTokenName] = useState('')
  const [tokenReadOnly, setTokenReadOnly] = useState(true)
  const [tokenEnvIds, setTokenEnvIds] = useState<string[]>([])
  const [tokenCreating, setTokenCreating] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [lastIssuedToken, setLastIssuedToken] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{
    account: ServiceAccountDto
    token: ServiceAccountTokenDto
  } | null>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )
  useRegisterShortcut('n', () => setCreateDialogOpen(true))

  const toggleEnvSelection = (id: string) => {
    setCreateEnvIds((prev) =>
      prev.includes(id) ? prev.filter((envId) => envId !== id) : [...prev, id],
    )
  }

  const handleCreateAccount = async () => {
    if (!createName.trim() || createEnvIds.length === 0 || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      await api.createServiceAccount(projectId, {
        name: createName.trim(),
        environmentIds: createEnvIds,
      })
      setCreateName('')
      setCreateEnvIds([])
      setCreateDialogOpen(false)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.serviceAccounts(projectId),
      })
    } catch (error) {
      setCreateError(getErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteAccount = async (account: ServiceAccountDto) => {
    await api.deleteServiceAccount(projectId, account.id)
    await queryClient.invalidateQueries({
      queryKey: queryKeys.serviceAccounts(projectId),
    })
  }

  const openTokenDialog = (account: ServiceAccountDto) => {
    setTokenAccount(account)
    setTokenName(`${account.name} token`)
    setTokenReadOnly(true)
    setTokenEnvIds(account.environmentIds)
    setTokenError(null)
    setLastIssuedToken(null)
    setTokenDialogOpen(true)
  }

  const handleCreateToken = async () => {
    if (!tokenAccount || tokenEnvIds.length === 0 || !tokenName.trim()) return
    setTokenCreating(true)
    setTokenError(null)
    try {
      const result = await api.createServiceAccountToken(tokenAccount.id, {
        name: tokenName.trim(),
        readOnly: tokenReadOnly,
        environmentIds: tokenEnvIds,
      })
      setLastIssuedToken(result.token)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.serviceAccounts(projectId),
      })
    } catch (error) {
      setTokenError(getErrorMessage(error))
    } finally {
      setTokenCreating(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!revokeTarget) return
    await api.deleteServiceAccountToken(
      revokeTarget.account.id,
      revokeTarget.token.id,
    )
    await queryClient.invalidateQueries({
      queryKey: queryKeys.serviceAccounts(projectId),
    })
    setRevokeTarget(null)
  }

  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null
  const envError = envErrorRaw ? getErrorMessage(envErrorRaw) : null
  const accountsError = accountsErrorRaw
    ? getErrorMessage(accountsErrorRaw)
    : null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Service accounts"
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

      {(projectsError || envError || accountsError) && (
        <ErrorBanner message={projectsError || envError || accountsError} />
      )}

      <SectionCard>
        <SectionHeader
          kicker="Service accounts"
          title="Account list"
          action={
            <Button
              variant="outline"
              className="border-border text-foreground hover:border-foreground/40 flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New service account
              <ShortcutHint keys="n" />
            </Button>
          }
        />

        <div className="mt-4 space-y-4">
          {accountsLoading ? (
            <p className="text-muted-foreground text-sm">
              Loading service accounts...
            </p>
          ) : accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No service accounts yet.
            </p>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className="border-border/70 bg-card/70 flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-4"
              >
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {account.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Created {formatDate(account.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => openTokenDialog(account)}
                  >
                    Issue token
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
                    onClick={() => handleDeleteAccount(account)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Tokens" title="Issued tokens" />
        <div className="mt-4 space-y-4">
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Issue a service account token to see it here.
            </p>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="space-y-2">
                <p className="text-muted-foreground text-xs font-semibold">
                  {account.name}
                </p>
                <div className="grid gap-2">
                  {(tokensByAccount[account.id] ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No tokens yet.
                    </p>
                  ) : (
                    (tokensByAccount[account.id] ?? []).map((token) => (
                      <div
                        key={token.id}
                        className="border-border/60 bg-background/60 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="text-foreground font-semibold">
                            {token.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Issued {formatDate(token.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() =>
                              setRevokeTarget({ account, token })
                            }
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create service account</DialogTitle>
            <DialogDescription>
              Choose the environments this account can access.
            </DialogDescription>
          </DialogHeader>
          {createError ? <ErrorBanner message={createError} /> : null}
          <div className="grid gap-3">
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Account name"
            />
            <div className="grid gap-2">
              {environments.map((env) => (
                <label
                  key={env.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={createEnvIds.includes(env.id)}
                    onCheckedChange={() => toggleEnvSelection(env.id)}
                  />
                  {env.name}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateAccount} disabled={creating}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue token</DialogTitle>
            <DialogDescription>
              Generate a token for this service account.
            </DialogDescription>
          </DialogHeader>
          {tokenError ? <ErrorBanner message={tokenError} /> : null}
          <div className="grid gap-3">
            <Input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="Token name"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={tokenReadOnly}
                onCheckedChange={(value) => setTokenReadOnly(Boolean(value))}
              />
              Read-only
            </label>
            <div className="grid gap-2">
              {environments.map((env) => (
                <label
                  key={env.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={tokenEnvIds.includes(env.id)}
                    onCheckedChange={() =>
                      setTokenEnvIds((prev) =>
                        prev.includes(env.id)
                          ? prev.filter((id) => id !== env.id)
                          : [...prev, env.id],
                      )
                    }
                  />
                  {env.name}
                </label>
              ))}
            </div>
            {lastIssuedToken ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <p className="font-semibold">Token issued</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="bg-emerald-100 rounded px-2 py-1 text-xs">
                    {lastIssuedToken}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard.writeText(lastIssuedToken)
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={handleCreateToken} disabled={tokenCreating}>
              Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revokeTarget)} onOpenChange={() => setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke token</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
              onClick={handleDeleteToken}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
