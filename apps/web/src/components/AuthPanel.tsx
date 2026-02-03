import { useState } from 'react'

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
    <section className="mx-auto w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-8 shadow-soft">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-slate-900">
        {mode === 'login' ? 'Sign in to manage secrets' : 'Start your secure workspace'}
      </h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        {mode === 'register' ? (
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Full name"
            className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm"
          />
        ) : null}
        <input
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          placeholder="Email"
          type="email"
          className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm"
        />
        <input
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          placeholder="Password"
          type="password"
          className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm"
        />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full bg-slate-900 text-sm font-semibold text-white"
        >
          {loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-4 text-xs font-semibold text-slate-600"
      >
        {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
      </button>
    </section>
  )
}
