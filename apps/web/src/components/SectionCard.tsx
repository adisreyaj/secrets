import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { Card, CardHeader, CardTitle } from './ui/card'

export const SectionCard = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <Card
    className={cn('border-border/70 bg-card/80 rounded-3xl p-6', className)}
  >
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
      <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase">
        {kicker}
      </p>
      <CardTitle className="mt-1">{title}</CardTitle>
    </div>
    {action}
  </CardHeader>
)
