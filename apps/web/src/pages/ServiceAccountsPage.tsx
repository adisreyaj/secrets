import type {
    EnvironmentDto,
    ProjectDto,
    ServiceAccountDto,
    ServiceAccountTokenDto,
} from '@secrets/shared'
import { ArrowLeft, Copy, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '../components/ui/tooltip'
import { api } from '../lib/api'
import { projectPath } from '../lib/paths'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ServiceAccountsPage = ({
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
  const { data: environmentsData, error: envError } = useAsyncResource<
    EnvironmentDto[]
  >(
    async () => (user ? api.listEnvironments(projectId) : []),
    [projectId, user],
  )
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const environments = environmentsData ?? []

  const [accounts, setAccounts] = useState<ServiceAccountDto[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsError, setAccountsError] = useState<string | null>(null)

  const [tokensByAccount, setTokensByAccount] = useState<
    Record<string, ServiceAccountTokenDto[]>
  >({})

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

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    setAccountsError(null)
    try {
      const data = await api.listServiceAccounts(projectId)
      setAccounts(data)
      const tokens = await Promise.all(
        data.map(async (account) => {
          const list = await api.listServiceAccountTokens(account.id)
          return [account.id, list] as const
        }),
      )
      setTokensByAccount(Object.fromEntries(tokens))
    } catch (error) {
      setAccountsError(getErrorMessage(error))
    } finally {
      setAccountsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user) {
      void loadAccounts()
    }
  }, [user, loadAccounts])

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
      await loadAccounts()
    } catch (error) {
      setCreateError(getErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteAccount = async (account: ServiceAccountDto) => {
    await api.deleteServiceAccount(projectId, account.id)
    await loadAccounts()
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
      const list = await api.listServiceAccountTokens(tokenAccount.id)
      setTokensByAccount((prev) => ({ ...prev, [tokenAccount.id]: list }))
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
    const list = await api.listServiceAccountTokens(revokeTarget.account.id)
    setTokensByAccount((prev) => ({ ...prev, [revokeTarget.account.id]: list }))
    setRevokeTarget(null)
  }

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
        <ErrorBanner
          message={(projectsError || envError || accountsError) as string}
        />
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
                className="border-border bg-card/80 rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground font-semibold">
                      {account.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {account.environmentIds.length} environment scopes
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full px-4 text-xs"
                      onClick={() => openTokenDialog(account)}
                    >
                      Create token
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-rose-200 px-4 text-xs text-rose-600 hover:border-rose-300 hover:text-rose-700"
                      onClick={() => handleDeleteAccount(account)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-3 space-y-2 text-xs">
                  {(tokensByAccount[account.id] ?? []).length === 0 ? (
                    <p>No tokens yet.</p>
                  ) : (
                    (tokensByAccount[account.id] ?? []).map((token) => (
                      <div
                        key={token.id}
                        className="border-border/60 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
                      >
                        <div>
                          <p className="text-foreground text-sm font-semibold">
                            {token.name}
                          </p>
                          <p>
                            {token.readOnly ? 'Read-only' : 'Read/write'} ·
                            created {formatDate(token.createdAt)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full px-3 text-xs"
                          onClick={() => setRevokeTarget({ account, token })}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>Issue service account token</DialogTitle>
            <DialogDescription>
              Tokens are shown once. Store them securely.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                Token name
              </span>
              <Input
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
                placeholder="Token name"
              />
            </label>
            <label className="flex items-center gap-3 text-sm leading-none">
              <Checkbox
                checked={tokenReadOnly}
                onCheckedChange={(value) => setTokenReadOnly(Boolean(value))}
              />
              <span>Read-only</span>
            </label>
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                Environment scopes
              </p>
              <div className="flex flex-wrap gap-3">
                {environments.map((env) => (
                  <label
                    key={env.id}
                    className="flex items-center gap-2 text-xs leading-none"
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
            </div>
            {tokenError ? (
              <ErrorBanner message={tokenError} className="mt-3" />
            ) : null}
            {lastIssuedToken ? (
              <div className="text-muted-foreground grid gap-2 text-xs">
                <p className="text-foreground font-semibold">New token</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-mono text-sm break-all text-emerald-800">
                    {lastIssuedToken}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 rounded-full p-0"
                        onClick={async () => {
                          if (!lastIssuedToken) return
                          await navigator.clipboard.writeText(lastIssuedToken)
                        }}
                        aria-label="Copy token"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy token</TooltipContent>
                  </Tooltip>
                </div>
                <p>
                  This token is only visible now. Copy and store it securely.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-sm"
              onClick={() => setTokenDialogOpen(false)}
            >
              Close
            </Button>
            {lastIssuedToken ? null : (
              <Button
                type="button"
                className="rounded-full px-6 text-sm font-semibold"
                onClick={handleCreateToken}
                disabled={
                  tokenCreating || !tokenName.trim() || tokenEnvIds.length === 0
                }
              >
                {tokenCreating ? 'Issuing...' : 'Issue token'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
      >
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Revoke token</DialogTitle>
            <DialogDescription>
              This token will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="text-muted-foreground text-sm">
            Token{' '}
            <span className="text-foreground font-semibold">
              {revokeTarget?.token.name}
            </span>{' '}
            for service account{' '}
            <span className="text-foreground font-semibold">
              {revokeTarget?.account.name}
            </span>
            .
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-sm"
              onClick={() => setRevokeTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full px-6 text-sm font-semibold"
              onClick={handleDeleteToken}
            >
              Revoke token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>Create service account</DialogTitle>
            <DialogDescription>
              Generate a scoped principal for automation and integrations.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="e.g. CI deploy bot"
            />
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                Environment scopes
              </p>
              <div className="flex flex-wrap gap-2">
                {environments.map((env) => (
                  <label
                    key={env.id}
                    className="flex items-center gap-2 px-3 py-1 text-xs"
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
            {createError ? (
              <ErrorBanner message={createError} className="mt-3" />
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-sm"
              onClick={() => setCreateDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              className="rounded-full px-6 text-sm font-semibold"
              onClick={handleCreateAccount}
              disabled={
                creating || !createName.trim() || createEnvIds.length === 0
              }
            >
              {creating ? 'Creating...' : 'Create service account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
