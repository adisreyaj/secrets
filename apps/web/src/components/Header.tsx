import type { UserDto } from '@secrets/shared'

export const Header = ({
  user,
  onLogout,
  onNavigate,
}: {
  user: UserDto | null
  onLogout: () => void
  onNavigate: (path: string) => void
}) => (
  <header className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-12 pt-10">
    <nav className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
          SM
        </div>
        <div>
          <p className="text-sm font-semibold">Secrets Manager</p>
          <p className="text-xs text-slate-500">Single-tenant vault</p>
        </div>
      </div>
      <div className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
        <button className="hover:text-slate-900" onClick={() => onNavigate('/projects')}>
          Projects
        </button>
        <button className="hover:text-slate-900" onClick={() => onNavigate('/projects')}>
          Environments
        </button>
        <button className="hover:text-slate-900" onClick={() => onNavigate('/projects')}>
          Audit
        </button>
        <button className="rounded-full border border-slate-300 px-4 py-2 text-slate-700 hover:border-slate-400">
          Invite
        </button>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <div className="hidden text-right text-xs text-slate-500 sm:block">
            <p className="font-semibold text-slate-700">{user.name ?? user.email}</p>
            <button onClick={onLogout} className="text-xs text-slate-500 hover:text-slate-700">
              Logout
            </button>
          </div>
        ) : (
          <div className="hidden text-right text-xs text-slate-500 sm:block">
            <p className="font-semibold text-slate-700">Not signed in</p>
          </div>
        )}
        <div className="h-10 w-10 rounded-full bg-slate-200" />
      </div>
    </nav>
  </header>
)
