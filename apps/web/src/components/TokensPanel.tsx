import type { ApiTokenDto, CreateTokenResponse } from '@secrets/shared'
import { useState } from 'react'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'

export const TokensPanel = ({
  tokens,
  loading,
  error,
  onCreate,
  lastCreated,
  onClearLastCreated,
}: {
  tokens: ApiTokenDto[]
  loading: boolean
  error: string | null
  onCreate: (name: string) => Promise<CreateTokenResponse | null>
  lastCreated: CreateTokenResponse | null
  onClearLastCreated: () => void
}) => {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(name.trim())
      setName('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <SectionCard>
      <SectionHeader
        kicker="API tokens"
        title="Programmatic access"
        action={
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Token name"
              className="h-9 rounded-full border border-slate-200 px-4 text-sm text-slate-700 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              {creating ? 'Creating...' : 'New token'}
            </button>
          </form>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      {lastCreated ? (
        <aside className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">
                Token created (copy once)
              </p>
              <p className="mt-2 font-mono text-sm">{lastCreated.token}</p>
            </div>
            <button
              onClick={onClearLastCreated}
              className="text-xs font-semibold text-emerald-700"
            >
              Clear
            </button>
          </div>
        </aside>
      ) : null}
      <ul className="mt-5 space-y-3">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
            Loading tokens...
          </li>
        ) : tokens.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
            No API tokens yet.
          </li>
        ) : (
          tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
            >
              <article>
                <p className="font-semibold text-slate-900">{token.name}</p>
                <p className="text-xs text-slate-500">
                  Created <time dateTime={token.createdAt}>{formatDateTime(token.createdAt)}</time>
                </p>
              </article>
              <span className="text-xs text-slate-500">
                Last used <time dateTime={token.lastUsedAt}>{formatDateTime(token.lastUsedAt)}</time>
              </span>
            </li>
          ))
        )}
      </ul>
      <aside className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        Tokens are visible once. Rotate frequently and scope by project.
      </aside>
    </SectionCard>
  )
}
