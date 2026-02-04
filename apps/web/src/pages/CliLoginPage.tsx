import type { ProjectDto } from '@secrets/shared'
import { useEffect, useState } from 'react'
import { AuthPanel } from '../components/AuthPanel'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const CliLoginPage = ({
  code,
  navigate,
}: {
  code?: string | null
  navigate: (path: string) => void
}) => {
  const { user, loading, error, login, register } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('none')
  const [tokenName, setTokenName] = useState('CLI login')
  const [loginCode, setLoginCode] = useState(code ?? '')
  const [issuing, setIssuing] = useState(false)
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setProjectsError(null)
    api
      .listProjects()
      .then((data) => {
        setProjects(data)
        if (data.length > 0) {
          setSelectedProject(data[0].id)
        }
      })
      .catch((err) => setProjectsError(getErrorMessage(err)))
  }, [user])

  if (!user) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-6">
        <AuthPanel
          loading={loading}
          error={error}
          onLogin={login}
          onRegister={register}
        />
      </section>
    )
  }

  const handleIssue = async () => {
    if (!loginCode.trim() || selectedProject === 'none' || issuing) return
    setIssuing(true)
    setIssueError(null)
    try {
      const data = await api.issueCliLogin({
        code: loginCode.trim(),
        projectId: selectedProject,
        name: tokenName.trim() || 'CLI login',
      })
      setIssuedToken(data.token)
    } catch (err) {
      setIssueError(getErrorMessage(err))
    } finally {
      setIssuing(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="CLI login"
        subtitle="Finish the browser login to issue a CLI token."
        actions={
          <Button
            variant="outline"
            className="rounded-full px-4 text-sm"
            onClick={() => navigate('/projects')}
          >
            Back to projects
          </Button>
        }
      />

      {(projectsError || issueError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || issueError}
        </div>
      )}

      <SectionCard>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Login code
            </span>
            <Input
              value={loginCode}
              onChange={(event) => setLoginCode(event.target.value)}
              placeholder="Paste the CLI code"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Project
            </span>
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Token name
            </span>
            <Input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="CLI login"
            />
          </label>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button
            className="rounded-full px-6 text-sm font-semibold"
            onClick={handleIssue}
            disabled={issuing || !loginCode.trim() || selectedProject === 'none'}
          >
            {issuing ? 'Issuing...' : 'Issue CLI token'}
          </Button>
        </div>

        {issuedToken ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <p className="font-semibold">CLI token created.</p>
            <p className="mt-2 font-mono text-xs break-all text-emerald-800">
              {issuedToken}
            </p>
            <p className="mt-2 text-xs text-emerald-700">
              You can return to the terminal to complete login.
            </p>
          </div>
        ) : null}
      </SectionCard>
    </section>
  )
}
