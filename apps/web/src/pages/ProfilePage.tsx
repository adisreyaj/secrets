import { ArrowLeft, KeyRound, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAuth } from '../lib/auth'
import { betterAuthClient } from '../lib/betterAuthClient'
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
  const [passkeyBusyId, setPasskeyBusyId] = useState<string | null>(null)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null)
  const [newPasskeyName, setNewPasskeyName] = useState('')

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

  useRegisterShortcut('b', () => navigate('/projects'))

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

  const handleAddPasskey = async () => {
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
      setNewPasskeyName('')
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

      <SectionCard className="space-y-6">
        <SectionHeader kicker="Security" title="Passkeys" />
        <p className="text-muted-foreground text-sm">
          Sign in with Face ID, Touch ID, Windows Hello, or a hardware security
          key.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-2 text-sm">
            <span className="muted-label">Label (optional)</span>
            <Input
              value={newPasskeyName}
              onChange={(event) => setNewPasskeyName(event.target.value)}
              placeholder="e.g. MacBook Touch ID"
            />
          </label>
          <Button
            type="button"
            disabled={passkeyAdding}
            onClick={() => void handleAddPasskey()}
          >
            <KeyRound className="h-4 w-4" />
            {passkeyAdding ? 'Waiting...' : 'Add passkey'}
          </Button>
        </div>
        {passkeyError ? <ErrorBanner message={passkeyError} /> : null}
        {passkeySuccess ? (
          <p className="text-sm text-emerald-600">{passkeySuccess}</p>
        ) : null}
        {passkeysLoading ? (
          <p className="text-muted-foreground text-sm">Loading passkeys...</p>
        ) : passkeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No passkeys yet. Add one after signing in with your password.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-xl border">
            {passkeys.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{passkeyLabel(item)}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.deviceType ?? 'unknown device'}
                    {item.backedUp ? ' · synced' : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={passkeyBusyId === item.id}
                  onClick={() => void handleDeletePasskey(item.id)}
                  aria-label={`Remove ${passkeyLabel(item)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </section>
  )
}
