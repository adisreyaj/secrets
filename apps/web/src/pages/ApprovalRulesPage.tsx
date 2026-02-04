import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApprovalAction, ApprovalRuleDto, EnvironmentDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRegisterShortcut } from '../lib/shortcuts'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ApprovalRulesPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [envError, setEnvError] = useState<string | null>(null)
  const [rules, setRules] = useState<ApprovalRuleDto[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleEnvironmentId, setRuleEnvironmentId] = useState<string>('all')
  const [rulePattern, setRulePattern] = useState('*')
  const [ruleActions, setRuleActions] = useState<ApprovalAction[]>(['CREATE', 'UPDATE'])

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login')
    }
  }, [user, loading, navigate])

  const loadProjects = useCallback(async () => {
    setProjectsError(null)
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (error) {
      setProjectsError(getErrorMessage(error))
    }
  }, [])

  const loadEnvironments = useCallback(async () => {
    setEnvError(null)
    try {
      const data = await api.listEnvironments(projectId)
      setEnvironments(data)
    } catch (error) {
      setEnvError(getErrorMessage(error))
    }
  }, [projectId])

  const loadRules = useCallback(async () => {
    setRulesLoading(true)
    setRulesError(null)
    try {
      const data = await api.listApprovalRules(projectId)
      setRules(data)
    } catch (error) {
      setRulesError(getErrorMessage(error))
    } finally {
      setRulesLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
      void loadRules()
    }
  }, [user, loadProjects, loadEnvironments, loadRules])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const isAdmin = selectedProject?.role === 'ADMIN'
  const envById = useMemo(() => {
    const map = new Map<string, string>()
    for (const env of environments) {
      map.set(env.id, env.name)
    }
    return map
  }, [environments])

  const toggleAction = (action: ApprovalAction) => {
    setRuleActions((prev) =>
      prev.includes(action) ? prev.filter((item) => item !== action) : [...prev, action],
    )
  }

  const handleCreateRule = async () => {
    if (!ruleName.trim() || !rulePattern.trim() || ruleActions.length === 0) {
      setRulesError('Rule name, pattern, and at least one action are required.')
      return
    }
    await api.createApprovalRule(projectId, {
      name: ruleName.trim(),
      environmentId: ruleEnvironmentId === 'all' ? null : ruleEnvironmentId,
      keyPattern: rulePattern.trim(),
      actions: ruleActions,
      isActive: true,
    })
    setRuleName('')
    setRulePattern('*')
    setRuleEnvironmentId('all')
    setRuleActions(['CREATE', 'UPDATE'])
    await loadRules()
  }

  const handleToggleRule = async (rule: ApprovalRuleDto) => {
    await api.updateApprovalRule(rule.id, { isActive: !rule.isActive })
    await loadRules()
  }

  const handleDeleteRule = async (ruleId: string) => {
    await api.deleteApprovalRule(ruleId)
    await loadRules()
  }

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Approval rules"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="flex items-center gap-2 rounded-full border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-foreground/40"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || envError || rulesError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError || rulesError}
        </div>
      )}

      <section className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Create rule</p>
            <p className="text-xs text-muted-foreground">
              Require approval for sensitive keys and actions.
            </p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => loadRules()}>
            Refresh
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="rule-name">
              Rule name
            </label>
            <Input
              id="rule-name"
              placeholder="Rule name"
              value={ruleName}
              onChange={(event) => setRuleName(event.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="rule-environment">
              Environment
            </label>
            <Select value={ruleEnvironmentId} onValueChange={setRuleEnvironmentId}>
              <SelectTrigger id="rule-environment" disabled={!isAdmin}>
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All environments</SelectItem>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="rule-pattern">
              Key pattern
            </label>
            <Input
              id="rule-pattern"
              placeholder="Key pattern (e.g. DATABASE_*)"
              value={rulePattern}
              onChange={(event) => setRulePattern(event.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {(['CREATE', 'UPDATE', 'DELETE', 'ROLLBACK', 'COPY', 'COPY_FROM'] as ApprovalAction[]).map(
            (action) => (
              <Button
                key={action}
                type="button"
                variant={ruleActions.includes(action) ? 'default' : 'outline'}
                className="rounded-full text-xs"
                onClick={() => toggleAction(action)}
                disabled={!isAdmin}
              >
                {action}
              </Button>
            ),
          )}
        </div>

        <div className="mt-4">
          <Button onClick={handleCreateRule} className="rounded-full" disabled={!isAdmin}>
            Create rule
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Existing rules</p>
        </div>
        <div className="mt-4 space-y-3">
          {rulesLoading ? (
            <p className="text-sm text-muted-foreground">Loading rules...</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet.</p>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/60 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Env: {rule.environmentId ? envById.get(rule.environmentId) ?? rule.environmentId : 'All'} · Pattern:{' '}
                    {rule.keyPattern}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Actions: {rule.actions.join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => handleToggleRule(rule)}
                    disabled={!isAdmin}
                  >
                    {rule.isActive ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
                    onClick={() => handleDeleteRule(rule.id)}
                    disabled={!isAdmin}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  )
}
