import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { ShortcutsHelpDialog } from './components/ShortcutsHelpDialog'
import { TooltipProvider } from './components/ui/tooltip'
import { useAuth } from './lib/auth'
import { getEnvironmentId, getProjectId, useHashRouter } from './lib/router'
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

const AppShell = () => {
  const { user, logout } = useAuth()
  const { match, navigate } = useHashRouter()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const shortcutsEnabled =
    !!user &&
    match.name !== 'login' &&
    match.name !== 'cli-login' &&
    match.name !== 'invite'

  useEffect(() => {
    const projectId = getProjectId(match)
    if (projectId) {
      setLastProjectId(projectId)
    }
    const environmentId = getEnvironmentId(match)
    if (projectId && environmentId) {
      setLastEnvironmentId(projectId, environmentId)
    }
  }, [match])

  const resolveProjectId = () => getProjectId(match) ?? getLastProjectId()

  const resolveEnvironmentId = (projectId: string | null) => {
    if (!projectId) return null
    return getEnvironmentId(match) ?? getLastEnvironmentId(projectId)
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
      navigate(projectId ? `/projects/${projectId}` : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g e',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? `/projects/${projectId}/environments` : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g s',
    () => {
      const projectId = resolveProjectId()
      navigate(
        projectId ? `/projects/${projectId}/service-accounts` : '/projects',
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
      const environmentId = resolveEnvironmentId(projectId)
      navigate(
        environmentId
          ? `/projects/${projectId}/environments/${environmentId}`
          : `/projects/${projectId}/environments`,
      )
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g a',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? `/projects/${projectId}/approvals` : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g t',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? `/projects/${projectId}/tokens` : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g l',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? `/projects/${projectId}/audit` : '/projects')
    },
    { enabled: shortcutsEnabled },
  )

  useRegisterShortcut(
    'g m',
    () => {
      const projectId = resolveProjectId()
      navigate(projectId ? `/projects/${projectId}/team` : '/projects')
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
          {match.name === 'login' ? (
            <LoginPage navigate={navigate} />
          ) : match.name === 'cli-login' ? (
            <CliLoginPage code={match.code} navigate={navigate} />
          ) : match.name === 'invite' ? (
            <InvitePage token={match.token} navigate={navigate} />
          ) : match.name === 'profile' ? (
            <ProfilePage navigate={navigate} />
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
          ) : match.name === 'approvals' ? (
            <ApprovalsPage projectId={match.projectId} navigate={navigate} />
          ) : match.name === 'approval-rules' ? (
            <ApprovalRulesPage
              projectId={match.projectId}
              navigate={navigate}
            />
          ) : match.name === 'tokens' ? (
            <TokensPage projectId={match.projectId} navigate={navigate} />
          ) : match.name === 'service-accounts' ? (
            <ServiceAccountsPage
              projectId={match.projectId}
              navigate={navigate}
            />
          ) : match.name === 'team' ? (
            <TeamPage projectId={match.projectId} navigate={navigate} />
          ) : (
            <EnvironmentPage
              projectId={match.projectId}
              environmentId={match.environmentId}
              navigate={navigate}
            />
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
    <ShortcutsProvider>
      <ShortcutHintsProvider>
        <AppShell />
      </ShortcutHintsProvider>
    </ShortcutsProvider>
  )
}
