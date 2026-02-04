import { useEffect, useState } from 'react'
import { AuthPanel } from '../components/AuthPanel'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Button } from '../components/ui/button'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const InvitePage = ({
  token,
  navigate,
}: {
  token?: string | null
  navigate: (path: string) => void
}) => {
  const { user, loading, error, login, register } = useAuth()
  const [status, setStatus] = useState<'idle' | 'accepting' | 'accepted'>('idle')
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    if (!token) return
    setStatus('accepting')
    setAcceptError(null)
    api
      .acceptInvite({ token })
      .then((data) => {
        setStatus('accepted')
        navigate(`/projects/${data.projectId}`)
      })
      .catch((err) => {
        setStatus('idle')
        setAcceptError(getErrorMessage(err))
      })
  }, [user, token, navigate])

  if (!user) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-6">
        <AuthPanel
          loading={loading}
          error={error}
          onLogin={login}
          onRegister={register}
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Accept invite"
        subtitle="Join your team workspace."
        actions={
          <Button
            variant="outline"
            className="rounded-full px-4 text-sm"
            onClick={() => navigate('/projects')}
          >
            Back to projects
          </Button>
        }
      />
      <SectionCard>
        {acceptError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {acceptError}
          </div>
        ) : status === 'accepting' ? (
          <p className="text-sm text-muted-foreground">Accepting invite...</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Use the invite link provided by your team.
          </p>
        )}
      </SectionCard>
    </section>
  )
}
