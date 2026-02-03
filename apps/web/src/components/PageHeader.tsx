import type { ReactNode } from 'react'

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
    {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
  </header>
)
