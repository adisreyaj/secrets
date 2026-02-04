import { SectionCard } from '../../components/SectionCard'
import { Input } from '../../components/ui/input'

export const SecretsSearchBar = ({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) => {
  return (
    <SectionCard className="-mb-px rounded-none border-y-0 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.2em]">
          Search secrets
        </label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Filter by key or value..."
          className="bg-background h-10 flex-1 rounded-2xl px-4"
        />
      </div>
    </SectionCard>
  )
}
