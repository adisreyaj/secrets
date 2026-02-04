import type { AuditLogDto } from '@secrets/shared'
import { ErrorBanner } from './ErrorBanner'
import { EmptyState } from './EmptyState'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'

export const AuditLog = ({
  audits,
  loading,
  error,
  withCard = true,
}: {
  audits: AuditLogDto[]
  loading: boolean
  error: string | null
  withCard?: boolean
}) => {
  const content = (
    <>
      <SectionHeader kicker="Audit log" title="Recent activity" />
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}
      <ul className="mt-5 space-y-4">
        {loading ? (
          <li>
            <EmptyState title="Loading audit log..." />
          </li>
        ) : audits.length === 0 ? (
          <li>
            <EmptyState title="No audit events yet." />
          </li>
        ) : (
          audits.slice(0, 6).map((audit) => (
            <li
              key={audit.id}
              className="relative flex items-start gap-3 pl-6 before:absolute before:left-[2px] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-indicator before:ring-2 before:ring-background/80 after:absolute after:left-[6px] after:top-3 after:h-[calc(100%+1rem)] after:w-px after:bg-border/80 last:after:hidden"
            >
              <article>
                <p className="text-sm font-semibold text-foreground">
                  {audit.action} · {audit.resourceType}
                </p>
                <p className="text-xs text-foreground/70">
                  {audit.resourceId?.slice(0, 6) ?? '—'} ·{' '}
                  <time dateTime={audit.createdAt}>{formatDateTime(audit.createdAt)}</time>
                </p>
              </article>
            </li>
          ))
        )}
      </ul>
    </>
  )

  return withCard ? <SectionCard>{content}</SectionCard> : content
}
