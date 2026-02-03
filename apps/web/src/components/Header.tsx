import type { UserDto } from '@secrets/shared'
import { Laptop, Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { useShortcutHints } from '../lib/shortcuts'

export const Header = ({
  user,
  onLogout,
  onProfile,
  onOpenShortcuts,
  showAccount = true,
}: {
  user: UserDto | null
  onLogout: () => void
  onProfile: () => void
  onOpenShortcuts: () => void
  showAccount?: boolean
}) => {
  const { theme, setTheme } = useTheme()
  const { enabled: hintsEnabled, setEnabled: setHintsEnabled } = useShortcutHints()
  const isCentered = !showAccount

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Laptop },
  ] as const

  return (
    <header className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-10 pb-12">
      <nav className={`flex items-center ${isCentered ? 'justify-center' : 'justify-between'}`}>
        <div className={`flex items-center gap-3 ${isCentered ? 'text-center' : ''}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
            SM
          </div>
          <div>
            <p className="text-sm font-semibold">Secrets Manager</p>
            <p className="text-xs text-muted-foreground">Single-tenant vault</p>
          </div>
        </div>
        {isCentered ? null : (
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" />
        )}
        {showAccount ? (
          <div className="flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-10 w-10 rounded-full bg-muted p-0 text-foreground hover:bg-muted/80"
                  >
                    {user.name ? user.name[0]?.toUpperCase() : 'U'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="shadow-soft w-56 rounded-2xl border-border bg-popover text-popover-foreground"
                >
                  <DropdownMenuLabel className="tracking-normal text-popover-foreground normal-case">
                    {user.name ?? user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onProfile}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onOpenShortcuts}>
                    Keyboard shortcuts
                    <DropdownMenuShortcut className="ml-auto rounded-md border border-foreground/20 bg-gradient-to-b from-background via-muted/60 to-muted px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-foreground/80 shadow-[0_1px_0_0_rgba(0,0,0,0.18),0_3px_0_0_rgba(0,0,0,0.08)] opacity-100">
                      ?
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setHintsEnabled(!hintsEnabled)}>
                    {hintsEnabled ? 'Hide keyboard hints' : 'Show keyboard hints'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Theme
                    </p>
                    <div className="flex items-center gap-2">
                      {themeOptions.map(({ value, label, icon: Icon }) => (
                        <Button
                          key={value}
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`${label} theme`}
                          aria-pressed={theme === value}
                          onClick={() => setTheme(value)}
                          className={
                            theme === value
                              ? 'bg-muted text-foreground hover:bg-muted'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                          }
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      ))}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="text-rose-600 focus:text-rose-600"
                  >
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <p className="font-semibold text-foreground">Not signed in</p>
              </div>
            )}
          </div>
        ) : null}
      </nav>
    </header>
  )
}
