import type { ReactNode } from 'react'

export const SectionCard = ({ children }: { children: ReactNode }) => (
  <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-soft">
    {children}
  </section>
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
  <header className="flex flex-wrap items-center justify-between gap-4">
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{kicker}</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
    </div>
    {action}
  </header>
)
