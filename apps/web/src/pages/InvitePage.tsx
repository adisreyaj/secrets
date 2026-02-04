import { useEffect, useState } from 'react'
import { AuthPanel } from '../components/AuthPanel'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { getErrorMessage } from '../lib/errors'

export const InvitePage = ({
  token,
  navigate,
}: {
  token?: string | null
  navigate: (path: string) => void
}) => {
  const { user, loading, error, login, register } = useAuth()
  const [status, setStatus] = useState<'idle' | 'accepting' | 'accepted'>(
    'idle',
  )
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
          <ErrorBanner message={acceptError} />
        ) : status === 'accepting' ? (
          <p className="text-muted-foreground text-sm">Accepting invite...</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Use the invite link provided by your team.
          </p>
        )}
      </SectionCard>
    </section>
  )
}
