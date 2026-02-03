import type { EnvironmentDto } from '@secrets/shared'
import { useState } from 'react'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'

export const EnvironmentsSection = ({
  environments,
  selectedEnvironmentId,
  loading,
  error,
  onSelect,
  onCreate,
}: {
  environments: EnvironmentDto[]
  selectedEnvironmentId: string | null
  loading: boolean
  error: string | null
  onSelect: (environmentId: string) => void
  onCreate: (name: string) => Promise<void>
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
        kicker="Environments"
        title="Rotation overview"
        action={
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New environment"
              className="h-9 rounded-full border border-slate-200 px-4 text-sm text-slate-700 focus:outline-none"
            />
            <button type="submit" className="text-sm font-semibold text-slate-700">
              {creating ? 'Creating...' : 'Add'}
            </button>
          </form>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <ul className="mt-5 space-y-3">
        {loading ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
            Loading environments...
          </li>
        ) : environments.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
            Create your first environment.
          </li>
        ) : (
          environments.map((env) => {
            const isSelected = env.id === selectedEnvironmentId
            return (
              <li key={env.id}>
                <button
                  onClick={() => onSelect(env.id)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200/70 bg-white text-slate-900'
                  }`}
                >
                  <div>
                    <p className="font-semibold">{env.name}</p>
                    <p className={`text-xs ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                      Updated{' '}
                      <time dateTime={env.updatedAt}>{formatDateTime(env.updatedAt)}</time>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {env.id.slice(0, 5)}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </SectionCard>
  )
}
