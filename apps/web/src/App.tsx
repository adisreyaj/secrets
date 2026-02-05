import { useEffect, useMemo, useState } from 'react'
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
import { api } from './lib/api'
import { projectPath, environmentPath, environmentsPath } from './lib/paths'
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
import { ApprovalRulesPage } from './pages/ApprovalRulesPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { AuditPage } from './pages/AuditPage'
import { CliLoginPage } from './pages/CliLoginPage'
import { EnvironmentPage } from './pages/EnvironmentPage'
import { EnvironmentsPage } from './pages/EnvironmentsPage'
import { InvitePage } from './pages/InvitePage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProjectOverviewPage } from './pages/ProjectOverviewPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ServiceAccountsPage } from './pages/ServiceAccountsPage'
import { TeamPage } from './pages/TeamPage'
import { TokensPage } from './pages/TokensPage'

const LoginRoute = () => {
  const navigate = useNavigate()
  return <LoginPage navigate={navigate} />
}

const CliLoginRoute = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  return <CliLoginPage code={searchParams.get('code')} navigate={navigate} />
}

const InviteRoute = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  return <InvitePage token={searchParams.get('token')} navigate={navigate} />
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
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <ProjectOverviewPage projectId={params.projectId} navigate={navigate} />
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

const ApprovalsRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <ApprovalsPage projectId={params.projectId} navigate={navigate} />
}

const ApprovalRulesRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <ApprovalRulesPage projectId={params.projectId} navigate={navigate} />
}

const TokensRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <TokensPage projectId={params.projectId} navigate={navigate} />
}

const ServiceAccountsRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <ServiceAccountsPage projectId={params.projectId} navigate={navigate} />
}

const TeamRoute = () => {
  const navigate = useNavigate()
  const params = useParams()
  if (!params.projectId) return <Navigate to="/projects" replace />
  return <TeamPage projectId={params.projectId} navigate={navigate} />
}

const AppShell = () => {
  const { user, loading: authLoading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [projectSlugById, setProjectSlugById] = useState(
    () => new Map<string, string>(),
  )
  const [projectIdBySlug, setProjectIdBySlug] = useState(
    () => new Map<string, string>(),
  )
  const [envSlugByProject, setEnvSlugByProject] = useState(
    () => new Map<string, Map<string, string>>(),
  )
  const [envIdByProject, setEnvIdByProject] = useState(
    () => new Map<string, Map<string, string>>(),
  )
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    null,
  )
  const [resolvedEnvironmentId, setResolvedEnvironmentId] = useState<
    string | null
  >(null)
  const [loadingProjectSlug, setLoadingProjectSlug] = useState<string | null>(
    null,
  )
  const [loadingEnvFor, setLoadingEnvFor] = useState<string | null>(null)

  const match = useMemo(
    () => getRouteMatch(location.pathname, location.search),
    [location.pathname, location.search],
  )
  const path = `${location.pathname}${location.search}`

  const shortcutsEnabled =
    !!user &&
    match.name !== 'login' &&
    match.name !== 'cli-login' &&
    match.name !== 'invite'
  const isPublicRoute =
    match.name === 'login' ||
    match.name === 'cli-login' ||
    match.name === 'invite'
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
    if (!user) return
    let active = true
    api
      .listProjects()
      .then((projects) => {
        if (!active) return
        const slugById = new Map<string, string>()
        const idBySlug = new Map<string, string>()
        for (const project of projects) {
          if (project.slug) {
            slugById.set(project.id, project.slug)
            idBySlug.set(project.slug, project.id)
          }
        }
        setProjectSlugById(slugById)
        setProjectIdBySlug(idBySlug)
      })
      .catch(() => null)
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    const projectSegment = getProjectId(match)
    if (!projectSegment) {
      setResolvedProjectId(null)
      setResolvedEnvironmentId(null)
      return
    }
    if (projectIdBySlug.has(projectSegment)) {
      setResolvedProjectId(projectIdBySlug.get(projectSegment) ?? null)
      return
    }

    if (!user) {
      if (authLoading) {
        setResolvedProjectId(null)
      } else {
        setResolvedProjectId(projectSegment)
      }
      return
    }

    if (loadingProjectSlug === projectSegment) return
    setResolvedProjectId(null)
    setLoadingProjectSlug(projectSegment)
    api
      .getProjectBySlug(projectSegment)
      .then((project) => {
        setProjectSlugById((prev) => {
          const next = new Map(prev)
          if (project.slug) next.set(project.id, project.slug)
          return next
        })
        setProjectIdBySlug((prev) => {
          const next = new Map(prev)
          if (project.slug) next.set(project.slug, project.id)
          return next
        })
        setResolvedProjectId(project.id)
      })
      .catch(() => {
        setResolvedProjectId(projectSegment)
      })
      .finally(() => {
        setLoadingProjectSlug((current) =>
          current === projectSegment ? null : current,
        )
      })
  }, [match, projectIdBySlug, loadingProjectSlug, user, authLoading])

  useEffect(() => {
    if (match.name !== 'environment') {
      setResolvedEnvironmentId(null)
      return
    }
    const projectId = resolvedProjectId
    const environmentSegment = getEnvironmentId(match)
    if (!projectId || !environmentSegment) {
      setResolvedEnvironmentId(null)
      return
    }

    const envIdMap = envIdByProject.get(projectId)
    if (envIdMap?.has(environmentSegment)) {
      setResolvedEnvironmentId(envIdMap.get(environmentSegment) ?? null)
      return
    }

    // Don't set resolvedEnvironmentId to segment yet — API needs id. Resolve after listEnvironments.
    if (loadingEnvFor === projectId) return
    setLoadingEnvFor(projectId)
    api
      .listEnvironments(projectId)
      .then((envs) => {
        const slugById = new Map<string, string>()
        const idBySlug = new Map<string, string>()
        for (const env of envs) {
          if (env.slug) {
            slugById.set(env.id, env.slug)
            idBySlug.set(env.slug, env.id)
          }
        }
        setEnvSlugByProject((prev) => {
          const next = new Map(prev)
          next.set(projectId, slugById)
          return next
        })
        setEnvIdByProject((prev) => {
          const next = new Map(prev)
          next.set(projectId, idBySlug)
          return next
        })
        setResolvedEnvironmentId(
          idBySlug.get(environmentSegment) ?? environmentSegment,
        )
      })
      .catch(() => null)
      .finally(() => {
        setLoadingEnvFor((current) => (current === projectId ? null : current))
      })
  }, [match, resolvedProjectId, envIdByProject, loadingEnvFor])

  useEffect(() => {
    const projectSegment = getProjectId(match)
    if (!projectSegment) return
    const projectId = resolvedProjectId ?? projectSegment
    const projectSlug =
      projectSlugById.get(projectId) ??
      (projectSegment !== projectId ? projectSegment : undefined)
    const envSegment = getEnvironmentId(match)
    const envSlug =
      match.name === 'environment' && resolvedEnvironmentId && projectId
        ? envSlugByProject.get(projectId)?.get(resolvedEnvironmentId) ??
          (envSegment && envSegment !== resolvedEnvironmentId
            ? envSegment
            : undefined)
        : undefined

    let desired: string | null = null
    if (match.name === 'project') {
      desired = projectPath(projectId, projectSlug)
    } else if (match.name === 'environments') {
      desired = environmentsPath(projectId, projectSlug)
    } else if (match.name === 'environment' && envSegment) {
      desired = environmentPath(
        projectId,
        projectSlug,
        resolvedEnvironmentId ?? envSegment,
        envSlug ?? envSegment,
      )
    } else if (match.name === 'audit') {
      desired = projectPath(projectId, projectSlug, 'audit')
    } else if (match.name === 'approvals') {
      desired = projectPath(projectId, projectSlug, 'approvals')
    } else if (match.name === 'approval-rules') {
      desired = projectPath(projectId, projectSlug, 'approval-rules')
    } else if (match.name === 'team') {
      desired = projectPath(projectId, projectSlug, 'team')
    } else if (match.name === 'tokens') {
      desired = projectPath(projectId, projectSlug, 'tokens')
    } else if (match.name === 'service-accounts') {
      desired = projectPath(projectId, projectSlug, 'service-accounts')
    }

    if (desired && desired !== path) {
      navigate(desired)
    }
  }, [
    match,
    navigate,
    path,
    projectSlugById,
    envSlugByProject,
    resolvedProjectId,
    resolvedEnvironmentId,
  ])

  useEffect(() => {
    const projectId = resolvedProjectId
    if (projectId) {
      setLastProjectId(projectId)
    }
    const environmentId =
      match.name === 'environment' ? resolvedEnvironmentId : null
    if (projectId && environmentId) {
      setLastEnvironmentId(projectId, environmentId)
    }
  }, [match, resolvedEnvironmentId, resolvedProjectId])

  const resolveProjectId = () => resolvedProjectId ?? getLastProjectId()

  const resolveEnvironmentId = (projectId: string | null) => {
    if (!projectId) return null
    return resolvedEnvironmentId ?? getLastEnvironmentId(projectId)
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
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(projectId ? projectPath(projectId, projectSlug) : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g e',
    () => {
      const projectId = resolveProjectId()
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(
        projectId ? environmentsPath(projectId, projectSlug) : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g s',
    () => {
      const projectId = resolveProjectId()
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(
        projectId
          ? projectPath(projectId, projectSlug, 'service-accounts')
          : '/projects',
      )
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
      const projectSlug = projectSlugById.get(projectId)
      const environmentId = resolveEnvironmentId(projectId)
      const envSlug =
        environmentId && envSlugByProject.get(projectId)?.get(environmentId)
      navigate(
        environmentId
          ? environmentPath(projectId, projectSlug, environmentId, envSlug)
          : environmentsPath(projectId, projectSlug),
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g a',
    () => {
      const projectId = resolveProjectId()
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(
        projectId ? projectPath(projectId, projectSlug, 'approvals') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g t',
    () => {
      const projectId = resolveProjectId()
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(
        projectId ? projectPath(projectId, projectSlug, 'tokens') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g l',
    () => {
      const projectId = resolveProjectId()
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(
        projectId ? projectPath(projectId, projectSlug, 'audit') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g m',
    () => {
      const projectId = resolveProjectId()
      const projectSlug = projectId ? projectSlugById.get(projectId) : undefined
      navigate(
        projectId ? projectPath(projectId, projectSlug, 'team') : '/projects',
      )
    },
    { enabled: shortcutsEnabled },
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0" aria-hidden="true" />
          {match.name !== 'login' &&
          match.name !== 'cli-login' &&
          match.name !== 'invite' ? (
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
        <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 pb-16">
          {shouldWaitForAuth || shouldBlockProtectedRoute ? (
            <section className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-foreground text-base font-medium">
                Checking your session
              </p>
              <p className="text-muted-foreground text-sm">
                Redirecting to login...
              </p>
            </section>
          ) : isResolvingProject ? (
            <div className="text-muted-foreground text-sm">
              Loading project...
            </div>
          ) : match.name === 'environment' && !resolvedEnvironmentId ? (
            <div className="text-muted-foreground text-sm">
              Loading environment...
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/cli-login" element={<CliLoginRoute />} />
              <Route path="/invite" element={<InviteRoute />} />
              <Route path="/profile" element={<ProfileRoute />} />
              <Route path="/projects" element={<ProjectsRoute />} />
              <Route path="/projects/:projectId" element={<ProjectOverviewRoute />} />
              <Route
                path="/projects/:projectId/environments"
                element={<EnvironmentsRoute />}
              />
              <Route
                path="/projects/:projectId/environments/:environmentId"
                element={<EnvironmentRoute />}
              />
              <Route path="/projects/:projectId/audit" element={<AuditRoute />} />
              <Route
                path="/projects/:projectId/approvals"
                element={<ApprovalsRoute />}
              />
              <Route
                path="/projects/:projectId/approval-rules"
                element={<ApprovalRulesRoute />}
              />
              <Route path="/projects/:projectId/team" element={<TeamRoute />} />
              <Route path="/projects/:projectId/tokens" element={<TokensRoute />} />
              <Route
                path="/projects/:projectId/service-accounts"
                element={<ServiceAccountsRoute />}
              />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
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
