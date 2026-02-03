import type { ReactNode } from 'react'
import { StatCard } from './StatCard'

export const Hero = ({
  title,
  subtitle,
  actions,
  stats,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
  stats: { label: string; value: string }[]
}) => (
  <section className="relative mx-auto grid w-full max-w-6xl gap-8 px-6 pb-12 md:grid-cols-[1.1fr_0.9fr]">
    <div className="space-y-5">
      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
        Secrets workspace
      </p>
      <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">
        {title}
      </h1>
      <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
        {subtitle}
      </p>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  </section>
)
