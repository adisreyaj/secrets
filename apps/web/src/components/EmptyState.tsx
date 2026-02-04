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
      'border-border bg-card/70 text-muted-foreground rounded-2xl border border-dashed p-4 text-sm',
      className,
    )}
  >
    <p className="text-foreground text-sm font-semibold">{title}</p>
    {description ? (
      <p className="text-muted-foreground mt-1 text-xs">{description}</p>
    ) : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
)
