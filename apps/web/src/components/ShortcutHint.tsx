import { useShortcutHints } from '../lib/shortcuts'

export const ShortcutHint = ({ keys }: { keys: string }) => {
  const { enabled } = useShortcutHints()
  if (!enabled) return null
  return (
    <kbd className="border-foreground/20 from-background via-muted/60 to-muted text-foreground/80 ml-auto rounded-md border bg-gradient-to-b px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] shadow-[0_1px_0_0_rgba(0,0,0,0.18),0_3px_0_0_rgba(0,0,0,0.08)]">
      {keys}
    </kbd>
  )
}
