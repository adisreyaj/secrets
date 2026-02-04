export const StatCard = ({
  label,
  value,
}: {
  label: string
  value: string
}) => (
  <dl className="border-border/60 bg-card/90 shadow-soft rounded-2xl border p-4">
    <dt className="text-muted-foreground text-xs tracking-[0.25em] uppercase">
      {label}
    </dt>
    <dd className="text-card-foreground mt-2 text-2xl font-semibold">
      {value}
    </dd>
  </dl>
)
