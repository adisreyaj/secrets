import { useState } from 'react'
import { Card } from './ui/card'
import { Button } from './ui/button'
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
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-foreground">
        {mode === 'login' ? 'Sign in to manage secrets' : 'Start your secure workspace'}
      </h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        {mode === 'register' ? (
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Full name"
            className="h-11 rounded-2xl"
          />
        ) : null}
        <Input
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          placeholder="Email"
          type="email"
          className="h-11 rounded-2xl"
        />
        <Input
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          placeholder="Password"
          type="password"
          className="h-11 rounded-2xl"
        />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90"
        >
          {loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
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
