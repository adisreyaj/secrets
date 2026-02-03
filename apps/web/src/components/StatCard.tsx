export const StatCard = ({ label, value }: { label: string; value: string }) => (
  <dl className="rounded-2xl border border-white/60 bg-white/90 p-4 shadow-soft">
    <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
    <dd className="mt-2 text-2xl font-semibold text-slate-900">{value}</dd>
  </dl>
)
