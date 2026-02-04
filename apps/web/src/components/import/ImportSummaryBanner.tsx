export const ImportSummaryBanner = ({
  created,
  updated,
  skipped,
}: {
  created: number
  updated: number
  skipped: number
}) => {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
      Imported {created} new, updated {updated}, skipped {skipped}.
    </div>
  )
}
