import { Header } from './components/Header'
import { useAuth } from './lib/auth'
import { useHashRouter } from './lib/router'
import { AuditPage } from './pages/AuditPage'
import { EnvironmentPage } from './pages/EnvironmentPage'
import { EnvironmentsPage } from './pages/EnvironmentsPage'
import { LoginPage } from './pages/LoginPage'
import { ProjectOverviewPage } from './pages/ProjectOverviewPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { TokensPage } from './pages/TokensPage'

export default function App() {
  const { user, logout } = useAuth()
  const { match, navigate } = useHashRouter()

  return (
    <div className="bg-cream min-h-screen text-slate-900">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true" />
        <Header user={user} onLogout={logout} onNavigate={navigate} />
      </div>

      <div
        className="pointer-events-none absolute top-24 -left-24 z-0 h-64 w-64 rounded-full bg-teal-200/70 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-10 -right-12 z-0 h-72 w-72 rounded-full bg-amber-200/70 blur-3xl"
        aria-hidden="true"
      />
      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16">
        {match.name === 'login' ? (
          <LoginPage navigate={navigate} />
        ) : match.name === 'projects' ? (
          <ProjectsPage navigate={navigate} />
        ) : match.name === 'project' ? (
          <ProjectOverviewPage
            projectId={match.projectId}
            navigate={navigate}
          />
        ) : match.name === 'environments' ? (
          <EnvironmentsPage projectId={match.projectId} navigate={navigate} />
        ) : match.name === 'audit' ? (
          <AuditPage projectId={match.projectId} navigate={navigate} />
        ) : match.name === 'tokens' ? (
          <TokensPage projectId={match.projectId} navigate={navigate} />
        ) : (
          <EnvironmentPage
            projectId={match.projectId}
            environmentId={match.environmentId}
            navigate={navigate}
          />
        )}
      </main>
    </div>
  )
}
