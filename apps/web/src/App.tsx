import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { Header } from './components/Header'
import { ShortcutsHelpDialog } from './components/ShortcutsHelpDialog'
import { TooltipProvider } from './components/ui/tooltip'
import { useAuth } from './lib/auth'
import { environmentPath, environmentsPath, projectPath } from './lib/paths'
import {
  getEnvironmentId,
  getProjectId,
  getRouteMatch,
  isProjectScopedRoute,
} from './lib/router'
import {
  ShortcutHintsProvider,
  ShortcutsProvider,
  useRegisterShortcut,
} from './lib/shortcuts'
import {
  getLastEnvironmentId,
  getLastProjectId,
  setLastEnvironmentId,
  setLastProjectId,
} from './lib/shortcuts.utils'
import { cn } from './lib/utils'
const AuditPage = lazy(() =>
  import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })),
)
const CliLoginPage = lazy(() =>
  import('./pages/CliLoginPage').then((m) => ({ default: m.CliLoginPage })),
)
const EnvironmentPage = lazy(() =>
  import('./pages/EnvironmentPage').then((m) => ({
    default: m.EnvironmentPage,
  })),
)
const EnvironmentsPage = lazy(() =>
  import('./pages/EnvironmentsPage').then((m) => ({
    default: m.EnvironmentsPage,
  })),
)
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
)
const TokensPage = lazy(() =>
  import('./pages/TokensPage').then((m) => ({ default: m.TokensPage })),
)

const LoginRoute = () => {
  const navigate = useNavigate()
  return <LoginPage navigate={navigate} />
}

const CliLoginRoute = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  return <CliLoginPage code={searchParams.get('code')} navigate={navigate} />
}

const ProfileRoute = () => {
  const navigate = useNavigate()
  return <ProfilePage navigate={navigate} />
}

const ProjectsRoute = () => {
  const navigate = useNavigate()
  return <ProjectsPage navigate={navigate} />
}

const ProjectOverviewRoute = () => {
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <Navigate to={projectPath(params.projectId, undefined, 'environments')} replace />
}

const EnvironmentsRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <EnvironmentsPage projectId={params.projectId} navigate={navigate} />
}

const EnvironmentRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId || !params.environmentId) {
    return <Navigate to="/projects" replace />
  }
  return (
    <EnvironmentPage
      projectId={params.projectId}
      environmentId={params.environmentId}
      navigate={navigate}
    />
  )
}

const AuditRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <AuditPage projectId={params.projectId} navigate={navigate} />
}

const TokensRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <TokensPage projectId={params.projectId} navigate={navigate} />
}

const AppShell = () => {
  const { user, loading: authLoading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    null,
  )

  const match = useMemo(
    () => getRouteMatch(location.pathname, location.search),
    [location.pathname, location.search],
  )

  const shortcutsEnabled =
    !!user && match.name !== 'login' && match.name !== 'cli-login'
  const isPublicRoute = match.name === 'login' || match.name === 'cli-login'
  const shouldWaitForAuth = authLoading && !isPublicRoute
  const shouldBlockProtectedRoute = !isPublicRoute && !user
  const isProjectScoped = isProjectScopedRoute(match)
  const isResolvingProject = isProjectScoped && !resolvedProjectId

  useEffect(() => {
    if (!authLoading && !user && !isPublicRoute) {
      navigate('/login')
    }
  }, [authLoading, user, isPublicRoute, navigate])

  useEffect(() => {
    const projectSegment = getProjectId(match)
    if (!projectSegment) {
      setResolvedProjectId(null)
      return
    }
    setResolvedProjectId(projectSegment)
  }, [match])

  useEffect(() => {
    const projectId = resolvedProjectId
    if (projectId) {
      setLastProjectId(projectId)
    }
    const environmentId = getEnvironmentId(match)
    if (projectId && environmentId) {
      setLastEnvironmentId(projectId, environmentId)
    }
  }, [match, resolvedProjectId])

  const resolveProjectId = () => resolvedProjectId ?? getLastProjectId()

  const resolveEnvironmentId = (projectId: string | null) => {
    if (!projectId) return null
    return getLastEnvironmentId(projectId)
  }

  useRegisterShortcut('?', () => setShortcutsOpen(true), {
    enabled: shortcutsEnabled,
  })

  useRegisterShortcut('g p', () => navigate('/projects'), {
    enabled: shortcutsEnabled,
  })

  useRegisterShortcut(
    'g o',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? projectPath(projectId) : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g e',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? environmentsPath(projectId) : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g c',
    () => {
      const projectId = resolveProjectId()
      if (!projectId) {
        navigate('/projects')
        return
      }
      const environmentId = resolveEnvironmentId(projectId)
      navigate(
        environmentId
          ? environmentPath(projectId, undefined, environmentId, undefined)
          : environmentsPath(projectId),
      )
    },
    { enabled: shortcutsEnabled },
  )


  useRegisterShortcut(
    'g t',
    () => {
      const projectId = resolveProjectId()
      navigate(
        projectId ? projectPath(projectId, undefined, 'tokens') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g l',
    () => {
      const projectId = resolveProjectId()
      navigate(
        projectId ? projectPath(projectId, undefined, 'audit') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g m',
    () => {
      const projectId = resolveProjectId()
      navigate(
        projectId ? projectPath(projectId, undefined, 'team') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0" aria-hidden="true" />
          {match.name !== 'login' && match.name !== 'cli-login' ? (
            <Header
              user={user}
              onLogout={logout}
              onProfile={() => navigate('/profile')}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              showAccount
            />
          ) : null}
        </div>

        <div
          className="bg-blob-left/50 pointer-events-none absolute top-24 left-0 z-0 h-64 w-64 rounded-full blur-3xl"
          aria-hidden="true"
        />
        <div
          className="bg-blob-right/50 pointer-events-none absolute top-10 right-0 z-0 h-72 w-72 rounded-full blur-3xl"
          aria-hidden="true"
        />
        <main
          className={cn(
            'relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6',
            isPublicRoute
              ? 'justify-center py-8'
              : 'gap-8 pb-16',
          )}
        >
          {shouldWaitForAuth || shouldBlockProtectedRoute ? (
            <section className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-foreground text-base">Checking your session</p>
              <p className="text-muted-foreground text-sm">
                Redirecting to login...
              </p>
            </section>
          ) : isResolvingProject ? (
            <div className="text-muted-foreground text-sm">
              Loading project...
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="text-muted-foreground text-sm">Loading…</div>
              }
            >
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/cli-login" element={<CliLoginRoute />} />
                <Route path="/profile" element={<ProfileRoute />} />
                <Route path="/projects" element={<ProjectsRoute />} />
                <Route
                  path="/projects/:projectId"
                  element={<ProjectOverviewRoute />}
                />
                <Route
                  path="/projects/:projectId/environments"
                  element={<EnvironmentsRoute />}
                />
                <Route
                  path="/projects/:projectId/environments/:environmentId"
                  element={<EnvironmentRoute />}
                />
                <Route
                  path="/projects/:projectId/audit"
                  element={<AuditRoute />}
                />
                <Route
                  path="/projects/:projectId/tokens"
                  element={<TokensRoute />}
                />
                <Route path="*" element={<Navigate to="/projects" replace />} />
              </Routes>
            </Suspense>
          )}
        </main>
        <ShortcutsHelpDialog
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          match={match}
        />
      </div>
    </TooltipProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ShortcutsProvider>
        <ShortcutHintsProvider>
          <AppShell />
        </ShortcutHintsProvider>
      </ShortcutsProvider>
    </BrowserRouter>
  )
}
