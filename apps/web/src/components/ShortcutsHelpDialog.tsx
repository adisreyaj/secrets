import type { RouteMatch } from '../lib/router'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

type ShortcutItem = { keys: string; label: string }

const globalShortcuts: ShortcutItem[] = [
  { keys: '?', label: 'Show keyboard shortcuts' },
  { keys: 'g p', label: 'Projects' },
  { keys: 'g o', label: 'Project overview' },
  { keys: 'g e', label: 'Environments list' },
  { keys: 'g c', label: 'Secrets' },
  { keys: 'g a', label: 'Approvals' },
  { keys: 'g l', label: 'Audit log' },
  { keys: 'g f', label: 'Feature flag environments' },
  { keys: 'g h', label: 'Auth environments' },
  { keys: 'g m', label: 'Team' },
  { keys: 'g t', label: 'API tokens' },
  { keys: 'g s', label: 'Service accounts' },
]

const pageShortcuts: Record<RouteMatch['name'], ShortcutItem[]> = {
  login: [],
  'cli-login': [],
  invite: [],
  projects: [{ keys: 'n', label: 'New project' }],
  project: [
    { keys: 'e', label: 'Environments' },
    { keys: 'l', label: 'Audit log' },
    { keys: 'a', label: 'Approvals' },
    { keys: 'h', label: 'Auth settings' },
    { keys: 'm', label: 'Team' },
    { keys: 't', label: 'API tokens' },
    { keys: 's', label: 'Service accounts' },
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
    { keys: 'c', label: 'Download CSV' },
    { keys: 'i', label: 'Import .env' },
    { keys: 'b', label: 'Back to environments' },
  ],
  audit: [{ keys: 'b', label: 'Back to overview' }],
  approvals: [{ keys: 'b', label: 'Back to overview' }],
  'approval-rules': [{ keys: 'b', label: 'Back to overview' }],
  'flag-environments': [{ keys: 'b', label: 'Back to overview' }],
  'flag-environment': [{ keys: 'b', label: 'Back to environments' }],
  flags: [{ keys: 'b', label: 'Back to overview' }],
  'flag-sdk-keys': [{ keys: 'b', label: 'Back to flags' }],
  'auth-environments': [{ keys: 'b', label: 'Back to overview' }],
  'auth-environment': [{ keys: 'b', label: 'Back to environments' }],
  auth: [{ keys: 'b', label: 'Back to overview' }],
  team: [{ keys: 'b', label: 'Back to overview' }],
  tokens: [
    { keys: 'n', label: 'Focus token name' },
    { keys: 'b', label: 'Back to overview' },
  ],
  'service-accounts': [{ keys: 'b', label: 'Back to overview' }],
  profile: [{ keys: 'b', label: 'Back to projects' }],
}

const ShortcutList = ({ items }: { items: ShortcutItem[] }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {items.map((item) => (
      <div
        key={`${item.keys}-${item.label}`}
        className="border-border/70 bg-card/80 flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">{item.label}</span>
        <kbd className="border-border bg-muted text-foreground rounded-lg border px-2 py-1 font-mono text-xs">
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
  const currentShortcuts = pageShortcuts[match.name] ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/70 bg-popover text-popover-foreground max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <p className="muted-label">Global</p>
            <ShortcutList items={globalShortcuts} />
          </section>
          {currentShortcuts.length > 0 ? (
            <section className="space-y-2">
              <p className="muted-label">This page</p>
              <ShortcutList items={currentShortcuts} />
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
