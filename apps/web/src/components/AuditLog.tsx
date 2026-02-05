import type { AuditLogDto } from '@secrets/shared'
import { ErrorBanner } from './ErrorBanner'
import { EmptyState } from './EmptyState'
import { formatDateTime } from '../lib/format'
import { SectionCard, SectionHeader } from './SectionCard'
import { humanizeAction, humanizeResourceType } from '../lib/auditLabels'

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
              className="before:bg-indicator before:ring-background/80 after:bg-border/80 relative flex items-start gap-3 pl-6 before:absolute before:top-1 before:left-[2px] before:h-2.5 before:w-2.5 before:rounded-full before:ring-2 after:absolute after:top-3 after:left-[6px] after:h-[calc(100%+1rem)] after:w-px last:after:hidden"
            >
              <article>
                <p className="text-foreground text-sm font-semibold">
                  {humanizeAction(audit.action)} ·{' '}
                  {humanizeResourceType(audit.resourceType)}
                </p>
                <p className="text-foreground/70 text-xs">
                  {audit.resourceId?.slice(0, 6) ?? '—'} ·{' '}
                  <time dateTime={audit.createdAt}>
                    {formatDateTime(audit.createdAt)}
                  </time>
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
