import type { ReactNode } from 'react'

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-foreground text-3xl font-semibold sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
      ) : null}
    </div>
    {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
  </header>
)
