import type { AuditLogDto } from '@secrets/shared'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'

export const AuditLog = ({
  audits,
  loading,
  error,
}: {
  audits: AuditLogDto[]
  loading: boolean
  error: string | null
}) => (
  <SectionCard>
    <SectionHeader kicker="Audit log" title="Recent activity" />
    {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
    <ul className="mt-5 space-y-4">
      {loading ? (
        <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
          Loading audit log...
        </li>
      ) : audits.length === 0 ? (
        <li className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
          No audit events yet.
        </li>
      ) : (
        audits.slice(0, 6).map((audit) => (
          <li key={audit.id} className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-teal-400" />
            <article>
              <p className="text-sm font-semibold text-slate-900">
                {audit.action} · {audit.resourceType}
              </p>
              <p className="text-xs text-slate-500">
                {audit.resourceId?.slice(0, 6) ?? '—'} ·{' '}
                <time dateTime={audit.createdAt}>{formatDateTime(audit.createdAt)}</time>
              </p>
            </article>
          </li>
        ))
      )}
    </ul>
  </SectionCard>
)
