import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import type { RouteMatch } from '../lib/router'

type ShortcutItem = { keys: string; label: string }

const globalShortcuts: ShortcutItem[] = [
  { keys: '?', label: 'Show keyboard shortcuts' },
  { keys: 'g p', label: 'Projects' },
  { keys: 'g o', label: 'Project overview' },
  { keys: 'g e', label: 'Environments list' },
  { keys: 'g s', label: 'Secrets' },
  { keys: 'g a', label: 'Audit log' },
  { keys: 'g t', label: 'API tokens' },
]

const pageShortcuts: Record<RouteMatch['name'], ShortcutItem[]> = {
  login: [],
  projects: [{ keys: 'n', label: 'New project' }],
  project: [
    { keys: 'e', label: 'Environments' },
    { keys: 'a', label: 'Audit log' },
    { keys: 't', label: 'API tokens' },
    { keys: 'b', label: 'Back to projects' },
  ],
  environments: [
    { keys: 'n', label: 'New environment' },
    { keys: 'b', label: 'Back to overview' },
  ],
  environment: [
    { keys: 'n', label: 'Add secret' },
    { keys: 'Shift+n', label: 'New environment' },
    { keys: 'v', label: 'Toggle values' },
    { keys: 'd', label: 'Download .env' },
    { keys: 'i', label: 'Import .env' },
    { keys: 'b', label: 'Back to environments' },
  ],
  audit: [{ keys: 'b', label: 'Back to overview' }],
  tokens: [
    { keys: 'n', label: 'Focus token name' },
    { keys: 'b', label: 'Back to overview' },
  ],
  profile: [],
}

const ShortcutList = ({ items }: { items: ShortcutItem[] }) => (
  <div className="space-y-2">
    {items.map((item) => (
      <div
        key={`${item.keys}-${item.label}`}
        className="flex items-center justify-between rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">{item.label}</span>
        <kbd className="rounded-lg border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground">
          {item.keys}
        </kbd>
      </div>
    ))}
  </div>
)

export const ShortcutsHelpDialog = ({
  open,
  onOpenChange,
  match,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  match: RouteMatch
}) => {
  const currentShortcuts = pageShortcuts[match.name]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-border/70 bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Global
            </p>
            <ShortcutList items={globalShortcuts} />
          </section>
          {currentShortcuts.length > 0 ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                This page
              </p>
              <ShortcutList items={currentShortcuts} />
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
