import type { ReactNode } from 'react'
import { Card, CardHeader, CardTitle } from './ui/card'

export const SectionCard = ({ children }: { children: ReactNode }) => (
  <Card className="rounded-3xl border-border/70 bg-card/80 p-6 shadow-soft">
    {children}
  </Card>
)

export const SectionHeader = ({
  kicker,
  title,
  action,
}: {
  kicker: string
  title: string
  action?: ReactNode
}) => (
  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 p-0">
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {kicker}
      </p>
      <CardTitle className="mt-1">{title}</CardTitle>
    </div>
    {action}
  </CardHeader>
)
