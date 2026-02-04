import { useState } from 'react'
import { ErrorBanner } from './ErrorBanner'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'

export const AuthPanel = ({
  loading,
  error,
  onLogin,
  onRegister,
}: {
  loading: boolean
  error: string | null
  onLogin: (payload: { email: string; password: string }) => Promise<void>
  onRegister: (payload: { email: string; password: string; name?: string }) => Promise<void>
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const passwordAutoComplete = mode === 'login' ? 'current-password' : 'new-password'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.email || !form.password) return
    if (mode === 'login') {
      await onLogin({ email: form.email, password: form.password })
    } else {
      await onRegister({
        name: form.name || undefined,
        email: form.email,
        password: form.password,
      })
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md rounded-3xl border-border/70 bg-card/90 p-8 shadow-soft">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
          SM
        </div>
        <div>
          <p className="text-sm font-semibold">Secrets Manager</p>
          <p className="text-xs text-muted-foreground">Single-tenant vault</p>
        </div>
      </div>
      <p className="mt-6 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </p>
      <h2 className="mt-3 text-center text-2xl font-semibold text-foreground">
        {mode === 'login' ? 'Sign in to manage secrets' : 'Start your secure workspace'}
      </h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        {mode === 'register' ? (
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Full name
            </span>
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
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Email
          </span>
          <Input
            id="auth-email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="Email"
            type="email"
            autoComplete="email"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Password
          </span>
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
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90"
        >
          {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      <Button
        variant="ghost"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-4 h-auto px-0 text-xs font-semibold text-muted-foreground hover:bg-transparent"
      >
        {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
      </Button>
    </Card>
  )
}
