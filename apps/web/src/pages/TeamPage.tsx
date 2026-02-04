import type {
    ProjectDto,
    ProjectInviteDto,
    ProjectMemberDto,
    Role,
} from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '../components/ui/tooltip'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'

export const TeamPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const { data: projectsData } = useAsyncResource<ProjectDto[]>(
    async () => (user ? api.listProjects() : []),
    [user],
  )
  const projects = projectsData ?? []

  const [members, setMembers] = useState<ProjectMemberDto[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)

  const [invites, setInvites] = useState<ProjectInviteDto[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [invitesError, setInvitesError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('VIEWER')
  const [inviteCreating, setInviteCreating] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))
  useRegisterShortcut('n', () => {
    if (isAdmin) setInviteDialogOpen(true)
  })

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      const data = await api.listMembers(projectId)
      setMembers(data)
    } catch (error) {
      setMembersError(getErrorMessage(error))
    } finally {
      setMembersLoading(false)
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

  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null
  const isAdmin = selectedProject?.role === 'ADMIN'

  useEffect(() => {
    if (user) {
      void loadMembers()
    }
  }, [user, loadMembers])

  useEffect(() => {
    if (user && isAdmin) {
      void loadInvites()
    }
  }, [user, isAdmin, loadInvites])

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

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={selectedProject?.name ?? 'Team'}
        subtitle="Manage team members and invites."
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

      <SectionCard>
        <SectionHeader
          kicker="Team"
          title="Members"
          action={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border text-foreground hover:border-foreground/40 flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                  onClick={() => setInviteDialogOpen(true)}
                  disabled={!isAdmin}
                >
                  Invite
                  <ShortcutHint keys="n" />
                </Button>
              </TooltipTrigger>
              {!isAdmin ? <TooltipContent>Admin only</TooltipContent> : null}
            </Tooltip>
          }
        />
        {membersError ? (
          <ErrorBanner message={membersError} className="mt-3" />
        ) : membersLoading ? (
          <EmptyState title="Loading members..." className="mt-3" />
        ) : members.length === 0 ? (
          <EmptyState title="No members yet." className="mt-3" />
        ) : (
          <div className="mt-4 space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="border-border bg-card/80 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-foreground font-semibold">
                    {member.name ?? member.email}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {member.email}
                  </p>
                </div>
                <span className="border-border text-muted-foreground rounded-full border px-3 py-1 text-xs font-semibold">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Team" title="Invite teammates" />

        {!isAdmin ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Only admins can invite teammates.
          </p>
        ) : null}
        {invitesError && isAdmin ? (
          <ErrorBanner message={invitesError} className="mt-3" />
        ) : null}

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
          {invitesError && isAdmin ? (
            <ErrorBanner message={invitesError} className="mt-3" />
          ) : invitesLoading ? (
            <EmptyState title="Loading invites..." className="mt-3" />
          ) : invites.filter((invite) => invite.status === 'PENDING').length ===
            0 ? (
            <EmptyState title="No invites yet." className="mt-3" />
          ) : (
            <div className="mt-3 space-y-2">
              {invites
                .filter((invite) => invite.status === 'PENDING')
                .map((invite) => (
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full px-4 text-xs"
                            onClick={() => handleRevokeInvite(invite.id)}
                            disabled={!isAdmin}
                          >
                            Revoke
                          </Button>
                        </TooltipTrigger>
                        {!isAdmin ? (
                          <TooltipContent>Admin only</TooltipContent>
                        ) : null}
                      </Tooltip>
                    ) : null}
                  </div>
                ))}
            </div>
          )}
        </div>
      </SectionCard>
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle>Invite teammate</DialogTitle>
            <DialogDescription>
              Send an invite link and assign a role.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.6fr]">
            <Input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@company.com"
              disabled={!isAdmin}
            />
            <Select
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as Role)}
            >
              <SelectTrigger disabled={!isAdmin}>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="EDITOR">Editor</SelectItem>
                <SelectItem value="VIEWER">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {invitesError && isAdmin ? (
            <ErrorBanner message={invitesError} className="mt-3" />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-sm"
              onClick={() => setInviteDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={handleCreateInvite}
              className="rounded-full px-6 text-sm font-semibold"
              disabled={!isAdmin || inviteCreating || !inviteEmail.trim()}
            >
              {inviteCreating ? 'Inviting...' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
