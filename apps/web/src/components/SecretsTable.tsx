import type { SecretDto } from '@secrets/shared'
import { useState } from 'react'
import { formatDateTime, formatKeyPreview } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'

export const SecretsTable = ({
  secrets,
  includeValues,
  loading,
  error,
  onToggleValues,
  onCreate,
  onUpdate,
  onRollback,
  onDelete,
}: {
  secrets: SecretDto[]
  includeValues: boolean
  loading: boolean
  error: string | null
  onToggleValues: (next: boolean) => void
  onCreate: (payload: { key: string; value: string }) => Promise<void>
  onUpdate: (secretId: string, value: string) => Promise<void>
  onRollback: (secretId: string) => Promise<void>
  onDelete: (secretId: string) => Promise<void>
}) => {
  const [form, setForm] = useState({ key: '', value: '' })
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.key.trim() || !form.value.trim() || creating) return
    setCreating(true)
    try {
      await onCreate({ key: form.key.trim(), value: form.value.trim() })
      setForm({ key: '', value: '' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <SectionCard>
      <SectionHeader
        kicker="Secrets"
        title="Key registry"
        action={
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              onClick={() => onToggleValues(!includeValues)}
              className="rounded-full bg-slate-100 px-3 py-1"
            >
              {includeValues ? 'Hide values' : 'Include values'}
            </button>
          </div>
        }
      />
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4"
      >
        <input
          value={form.key}
          onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
          placeholder="SECRET_KEY"
          className="h-9 flex-1 rounded-full border border-slate-200 px-4 text-sm text-slate-700 focus:outline-none"
        />
        <input
          value={form.value}
          onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
          placeholder="secret-value"
          className="h-9 flex-1 rounded-full border border-slate-200 px-4 text-sm text-slate-700 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {creating ? 'Saving...' : 'Add secret'}
        </button>
      </form>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/70">
        <table className="min-w-[760px] w-full border-separate border-spacing-0">
          <caption className="sr-only">Secrets list</caption>
          <thead className="bg-slate-50">
            <tr className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <th scope="col" className="px-4 py-3 text-left">
                Key
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Updated
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Version
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Value
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                  Loading secrets...
                </td>
              </tr>
            ) : secrets.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                  No secrets in this environment.
                </td>
              </tr>
            ) : (
              secrets.map((secret) => (
                <tr
                  key={secret.id}
                  className="border-t border-slate-200/70 text-sm text-slate-600"
                >
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900">
                    <p>{secret.key}</p>
                    <p className="text-xs text-slate-500">ID {secret.id.slice(0, 6)}</p>
                  </th>
                  <td className="px-4 py-3">
                    <time dateTime={secret.updatedAt}>{formatDateTime(secret.updatedAt)}</time>
                  </td>
                  <td className="px-4 py-3">{secret.versionId?.slice(0, 6) ?? '—'}</td>
                  <td className="px-4 py-3">
                    {includeValues ? formatKeyPreview(secret.value) : 'Hidden'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={async () => {
                          const nextValue = prompt(`Update ${secret.key}`)
                          if (nextValue) {
                            await onUpdate(secret.id, nextValue)
                          }
                        }}
                        className="rounded-full border border-slate-200 px-3 py-1"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => onRollback(secret.id)}
                        className="rounded-full border border-slate-200 px-3 py-1"
                      >
                        Rollback
                      </button>
                      <button
                        onClick={() => onDelete(secret.id)}
                        className="rounded-full border border-rose-200 px-3 py-1 text-rose-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
