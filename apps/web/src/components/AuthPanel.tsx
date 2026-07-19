import { useEffect, useState } from 'react'
import { betterAuthClient } from '../lib/betterAuthClient'
import { ErrorBanner } from './ErrorBanner'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Separator } from './ui/separator'

export const AuthPanel = ({
  loading,
  error,
  onLogin,
  onLoginWithPasskey,
  onRegister,
}: {
  loading: boolean
  error: string | null
  onLogin: (payload: { email: string; password: string }) => Promise<void>
    onLoginWithPasskey: () => Promise<void>
  onRegister: (payload: {
    email: string
    password: string
    name?: string
  }) => Promise<void>
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const signupAllowed = true
  const passwordAutoComplete =
    mode === 'login' ? 'current-password webauthn' : 'new-password'

  useEffect(() => {
    if (!signupAllowed && mode === 'register') {
      setMode('login')
    }
  }, [signupAllowed, mode])

  // Conditional UI: let the browser offer a saved passkey on the email field.
  useEffect(() => {
    if (mode !== 'login') return
    if (
      typeof PublicKeyCredential === 'undefined' ||
      !PublicKeyCredential.isConditionalMediationAvailable
    ) {
      return
    }
    void PublicKeyCredential.isConditionalMediationAvailable().then((available) => {
      if (!available) return
      void betterAuthClient.signIn.passkey({ autoFill: true })
    })
  }, [mode])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.email || !form.password) return
    if (mode === 'login') {
      await onLogin({ email: form.email, password: form.password })
    } else if (signupAllowed) {
      await onRegister({
        name: form.name || undefined,
        email: form.email,
        password: form.password,
      })
    }
  }

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true)
    try {
      await onLoginWithPasskey()
    } finally {
      setPasskeyLoading(false)
    }
  }

  const busy = loading || passkeyLoading

  return (
    <Card className="border-border/70 bg-card/90 shadow-soft mx-auto w-full max-w-md rounded-3xl p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img
          src="/logo.svg"
          alt="Secrets"
          className="h-10 w-10 rounded-2xl object-contain dark:invert"
        />
        <div>
          <p className="text-sm font-semibold">Secrets</p>
          <p className="text-muted-foreground text-xs">Secure your secrets!</p>
        </div>
      </div>
      <p className="text-muted-foreground mt-6 text-center text-xs tracking-[0.3em] uppercase">
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </p>
      <h2 className="text-foreground mt-3 text-center text-2xl font-semibold">
        {mode === 'login'
          ? 'Sign in to manage secrets'
          : 'Start your secure workspace'}
      </h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        {mode === 'register' ? (
          <label className="grid gap-2 text-sm">
            <span className="muted-label">Full name</span>
            <Input
              id="auth-name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Full name"
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm">
          <span className="muted-label">Email</span>
          <Input
            id="auth-email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="Email"
            type="email"
            autoComplete={mode === 'login' ? 'username webauthn' : 'email'}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="muted-label">Password</span>
          <Input
            id="auth-password"
            value={form.password}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            placeholder="Password"
            type="password"
            autoComplete={passwordAutoComplete}
          />
        </label>
        {error ? <ErrorBanner message={error} className="mt-3" /> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {loading
            ? 'Loading...'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
        </Button>
      </form>
      {mode === 'login' ? (
        <>
          <div className="my-4 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <Separator className="flex-1" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void handlePasskeySignIn()}
          >
            {passkeyLoading ? 'Waiting for passkey...' : 'Sign in with passkey'}
          </Button>
        </>
      ) : null}
      {signupAllowed ? (
        <Button
          variant="ghost"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login'
            ? 'Need an account? Register'
            : 'Already have an account? Sign in'}
        </Button>
      ) : null}
    </Card>
  )
}
