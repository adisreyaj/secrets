export const ShortcutHint = ({ keys }: { keys: string }) => (
  <kbd className="ml-auto rounded-md border border-foreground/20 bg-gradient-to-b from-background via-muted/60 to-muted px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-foreground/80 shadow-[0_1px_0_0_rgba(0,0,0,0.18),0_3px_0_0_rgba(0,0,0,0.08)]">
    {keys}
  </kbd>
)
