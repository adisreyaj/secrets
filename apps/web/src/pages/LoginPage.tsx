import { useEffect } from 'react'
import { AuthPanel } from '../components/AuthPanel'
import { useAuth } from '../lib/auth'

export const LoginPage = ({
  navigate,
}: {
  navigate: (path: string) => void
}) => {
  const { user, loading, error, clearError, login, loginWithPasskey, register } =
    useAuth()

  useEffect(() => {
    if (user) {
      navigate('/projects')
    }
  }, [user, navigate])

  return (
    <section className="flex w-full flex-col items-center justify-center gap-6">
      <AuthPanel
        loading={loading}
        error={error}
        onClearError={clearError}
        onLogin={login}
        onLoginWithPasskey={loginWithPasskey}
        onRegister={register}
      />
    </section>
  )
}
