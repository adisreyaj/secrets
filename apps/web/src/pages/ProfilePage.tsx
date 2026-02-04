import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { useAuth } from '../lib/auth'

export const ProfilePage = ({
  navigate,
}: {
  navigate: (path: string) => void
}) => {
  const { user, loading, updateProfile } = useAuth()
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

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name ?? '' })
    }
  }, [user])

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
      setProfileError(error instanceof Error ? error.message : 'Something went wrong.')
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
      setPasswordError(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setPasswordSaving(false)
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
            className="gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
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
            <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Full name
            </span>
            <Input
              value={profileForm.name}
              onChange={(event) =>
                setProfileForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Your name"
            />
            <span className="text-xs text-muted-foreground opacity-0 select-none">
              Email updates are disabled for now.
            </span>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Email
            </span>
            <Input
              type="email"
              value={user?.email ?? ''}
              disabled
              readOnly
              variant="muted"
            />
            <span className="text-xs text-muted-foreground">
              Email updates are disabled for now.
            </span>
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={profileSaving}
              className="h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              {profileSaving ? 'Saving...' : 'Save changes'}
            </Button>
            {profileError ? (
              <p className="text-sm text-rose-600">{profileError}</p>
            ) : null}
            {profileSuccess ? (
              <p className="text-sm text-emerald-600">{profileSuccess}</p>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard className="space-y-6">
        <SectionHeader kicker="Security" title="Password" />
        <form onSubmit={handlePasswordSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Current password
            </span>
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
            <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              New password
            </span>
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
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={passwordSaving}
              className="h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              {passwordSaving ? 'Updating...' : 'Update password'}
            </Button>
            {passwordError ? (
              <p className="text-sm text-rose-600">{passwordError}</p>
            ) : null}
            {passwordSuccess ? (
              <p className="text-sm text-emerald-600">{passwordSuccess}</p>
            ) : null}
          </div>
        </form>
      </SectionCard>
    </section>
  )
}
