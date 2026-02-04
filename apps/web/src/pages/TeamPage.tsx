import { useCallback, useEffect, useState } from 'react'
import type { ProjectDto, ProjectInviteDto, ProjectMemberDto, Role } from '@secrets/shared'
import { ArrowLeft, Users } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { SectionCard } from '../components/SectionCard'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRegisterShortcut } from '../lib/shortcuts'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const TeamPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  const loadProjects = useCallback(async () => {
    setProjectsError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    }
  }, [])

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

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadMembers()
      void loadInvites()
    }
  }, [user, loadProjects, loadMembers, loadInvites])

  const selectedProject = projects.find((project) => project.id === projectId) ?? null

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
            className="flex items-center gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || membersError || invitesError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || membersError || invitesError}
        </div>
      )}

      <SectionCard>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" />
          Members
        </div>
        {membersLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading members...</p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {member.name ?? member.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Invite teammates</h3>
          <p className="text-xs text-muted-foreground">
            Send an invite link and assign a role.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.6fr_auto]">
          <Input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="teammate@company.com"
            className="h-11 rounded-2xl px-4"
          />
          <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as Role)}>
            <SelectTrigger className="h-11 px-4">
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
