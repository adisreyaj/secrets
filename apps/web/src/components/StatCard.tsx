export const StatCard = ({ label, value }: { label: string; value: string }) => (
  <dl className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-soft">
    <dt className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
      {label}
    </dt>
    <dd className="mt-2 text-2xl font-semibold text-card-foreground">
      {value}
    </dd>
  </dl>
)
