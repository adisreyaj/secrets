import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { useAuth } from '../lib/auth'
import { betterAuthClient } from '../lib/betterAuthClient'
import { formatDateTime } from '../lib/format'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

type PasskeyRow = {
  id: string
  name?: string | null
  createdAt?: Date | string | null
  deviceType?: string | null
  backedUp?: boolean
}

const passkeyLabel = (item: PasskeyRow) => item.name?.trim() || 'Passkey'

export const ProfilePage = ({
  navigate,
}: {
  navigate: (path: string) => void
}) => {
  const { updateProfile } = useAuth()
  const { user } = useRequireAuth(navigate)
  const [profileForm, setProfileForm] = useState({ name: '' })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [passkeysLoading, setPasskeysLoading] = useState(true)
  const [passkeyAdding, setPasskeyAdding] = useState(false)
  const [passkeyDialogOpen, setPasskeyDialogOpen] = useState(false)
  const [passkeyBusyId, setPasskeyBusyId] = useState<string | null>(null)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null)
  const [newPasskeyName, setNewPasskeyName] = useState('')
  const passkeyNameInputRef = useRef<HTMLInputElement | null>(null)

  const loadPasskeys = useCallback(async () => {
    setPasskeysLoading(true)
    setPasskeyError(null)
    try {
      const { data, error } = await betterAuthClient.passkey.listUserPasskeys()
      if (error) {
        throw new Error(error.message || 'Failed to load passkeys')
      }
      setPasskeys((data ?? []) as PasskeyRow[])
    } catch (error) {
      setPasskeyError(
        error instanceof Error ? error.message : 'Failed to load passkeys.',
      )
    } finally {
      setPasskeysLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name ?? '' })
      void loadPasskeys()
    }
  }, [user, loadPasskeys])

  useEffect(() => {
    if (passkeyDialogOpen) {
      const timeout = window.setTimeout(() => {
        passkeyNameInputRef.current?.focus()
        passkeyNameInputRef.current?.select()
      }, 0)
      return () => window.clearTimeout(timeout)
    }
    setNewPasskeyName('')
  }, [passkeyDialogOpen])

  useRegisterShortcut('b', () => navigate('/projects'))
  useRegisterShortcut('n', () => setPasskeyDialogOpen(true))

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(null)
    try {
      await updateProfile({
        name: profileForm.name,
      })
      setProfileSuccess('Profile updated.')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordSaving(true)
    setPasswordError(null)
    setPasswordSuccess(null)
    try {
      await updateProfile({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordSuccess('Password updated.')
      setPasswordForm({ currentPassword: '', newPassword: '' })
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleAddPasskey = async (event: React.FormEvent) => {
    event.preventDefault()
    if (passkeyAdding) return
    setPasskeyAdding(true)
    setPasskeyError(null)
    setPasskeySuccess(null)
    try {
      const { error } = await betterAuthClient.passkey.addPasskey({
        name: newPasskeyName.trim() || undefined,
      })
      if (error) {
        throw new Error(error.message || 'Failed to add passkey')
      }
      setPasskeyDialogOpen(false)
      setPasskeySuccess('Passkey added.')
      await loadPasskeys()
    } catch (error) {
      setPasskeyError(
        error instanceof Error ? error.message : 'Failed to add passkey.',
      )
    } finally {
      setPasskeyAdding(false)
    }
  }

  const handleDeletePasskey = async (id: string) => {
    setPasskeyBusyId(id)
    setPasskeyError(null)
    setPasskeySuccess(null)
    try {
      const { error } = await betterAuthClient.passkey.deletePasskey({ id })
      if (error) {
        throw new Error(error.message || 'Failed to remove passkey')
      }
      setPasskeySuccess('Passkey removed.')
      await loadPasskeys()
    } catch (error) {
      setPasskeyError(
        error instanceof Error ? error.message : 'Failed to remove passkey.',
      )
    } finally {
      setPasskeyBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Profile"
        subtitle="Update your personal details and security settings."
        actions={
          <Button
            variant="outline"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      <SectionCard className="space-y-6">
        <SectionHeader kicker="Profile" title="Personal info" />
        <form
          onSubmit={handleProfileSubmit}
          className="grid items-start gap-4 md:grid-cols-2"
        >
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Full name</span>
            <Input
              value={profileForm.name}
              onChange={(event) =>
                setProfileForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="Your name"
            />
            <span className="text-muted-foreground text-xs opacity-0 select-none">
              Email updates are disabled for now.
            </span>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Email</span>
            <Input
              type="email"
              value={user?.email ?? ''}
              disabled
              readOnly
              variant="muted"
            />
            <span className="text-muted-foreground text-xs">
              Email updates are disabled for now.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Saving...' : 'Save changes'}
            </Button>
            {profileError ? (
              <ErrorBanner message={profileError} className="mt-3" />
            ) : null}
            {profileSuccess ? (
              <p className="text-sm text-emerald-600">{profileSuccess}</p>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard className="space-y-6">
        <SectionHeader kicker="Security" title="Password" />
        <form
          onSubmit={handlePasswordSubmit}
          className="grid gap-4 md:grid-cols-2"
        >
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Current password</span>
            <Input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  currentPassword: event.target.value,
                }))
              }
              placeholder="Current password"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="muted-label">New password</span>
            <Input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  newPassword: event.target.value,
                }))
              }
              placeholder="New password"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? 'Updating...' : 'Update password'}
            </Button>
            {passwordError ? (
              <ErrorBanner message={passwordError} className="mt-3" />
            ) : null}
            {passwordSuccess ? (
              <p className="text-sm text-emerald-600">{passwordSuccess}</p>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          kicker="Security"
          title="Passkeys"
          action={
            <Dialog open={passkeyDialogOpen} onOpenChange={setPasskeyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <Plus className="h-4 w-4" />
                  New passkey
                  <ShortcutHint keys="n" />
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
                <DialogHeader className="text-left">
                  <DialogTitle>Create passkey</DialogTitle>
                  <DialogDescription>
                    Sign in with Face ID, Touch ID, Windows Hello, or a hardware
                    security key.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(event) => void handleAddPasskey(event)}
                  className="grid gap-4"
                >
                  <label className="grid gap-2 text-sm">
                    <span className="muted-label">Passkey name</span>
                    <Input
                      ref={passkeyNameInputRef}
                      value={newPasskeyName}
                      onChange={(event) => setNewPasskeyName(event.target.value)}
                      placeholder="e.g. MacBook Touch ID"
                      autoComplete="off"
                    />
                    <span className="text-muted-foreground text-xs">
                      Optional label to help you recognize this device later.
                    </span>
                  </label>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPasskeyDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={passkeyAdding}>
                      {passkeyAdding ? 'Waiting...' : 'Create passkey'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          }
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Sign in with Face ID, Touch ID, Windows Hello, or a hardware security
          key.
        </p>
        {passkeyError ? (
          <ErrorBanner message={passkeyError} className="mt-4" />
        ) : null}
        {passkeySuccess ? (
          <p className="mt-4 text-sm text-emerald-600">{passkeySuccess}</p>
        ) : null}
        <ul className="mt-5 space-y-3">
          {passkeysLoading ? (
            <li>
              <EmptyState title="Loading passkeys..." />
            </li>
          ) : passkeys.length === 0 ? (
              <li>
                <EmptyState title="No passkeys yet. Add one after signing in with your password." />
              </li>
            ) : (
                passkeys.map((item) => {
                  const createdAt =
                    item.createdAt instanceof Date
                      ? item.createdAt.toISOString()
                      : item.createdAt
                  return (
                    <li
                      key={item.id}
                  className="border-border bg-card flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                >
                  <article className="min-w-0">
                    <p className="text-foreground truncate font-semibold">
                      {passkeyLabel(item)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Created{' '}
                      <time dateTime={createdAt ?? undefined}>
                        {formatDateTime(createdAt)}
                      </time>
                    </p>
                  </article>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="bg-muted text-muted-foreground"
                    >
                      {item.deviceType ?? 'unknown'}
                    </Badge>
                    {item.backedUp ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-50 text-emerald-700"
                      >
                        Synced
                      </Badge>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={passkeyBusyId === item.id}
                      onClick={() => void handleDeletePasskey(item.id)}
                      aria-label={`Remove ${passkeyLabel(item)}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {passkeyBusyId === item.id ? 'Removing...' : 'Delete'}
                    </Button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </SectionCard>
    </section>
  )
}
