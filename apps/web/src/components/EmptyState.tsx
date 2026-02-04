import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export const EmptyState = ({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) => (
  <div
    className={cn(
      'rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground',
      className,
    )}
  >
    <p className="text-foreground text-sm font-semibold">{title}</p>
    {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
)
