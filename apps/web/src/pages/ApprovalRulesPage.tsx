import type {
  ApprovalAction,
  ApprovalRuleDto,
  EnvironmentDto,
  ProjectDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { projectPath } from '../lib/paths'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

type ApprovalRulesPageProps = {
  projectId: string
  navigate: (path: string) => void
}

export const ApprovalRulesPage = ({ projectId, navigate }: ApprovalRulesPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const { data: environmentsData, error: envErrorRaw } =
    useQuery<EnvironmentDto[]>({
      queryKey: queryKeys.environments(projectId),
      queryFn: () => api.listEnvironments(projectId),
      enabled: Boolean(user) && Boolean(projectId),
    })
  const projects = asArray(projectsData)
  const environments = asArray(environmentsData)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleEnvironmentId, setRuleEnvironmentId] = useState<string>('all')
  const [rulePattern, setRulePattern] = useState('*')
  const [ruleActions, setRuleActions] = useState<ApprovalAction[]>([
    'CREATE',
    'UPDATE',
  ])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const {
    data: rulesData,
    isLoading: rulesLoading,
    error: rulesErrorRaw,
  } = useQuery<ApprovalRuleDto[]>({
    queryKey: queryKeys.approvalRules(projectId),
    queryFn: () => api.listApprovalRules(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const rules = asArray(rulesData)

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
      prev.includes(action)
        ? prev.filter((item) => item !== action)
        : [...prev, action],
    )
  }

  const handleCreateRule = async () => {
    setRulesError(null)
    if (!ruleName.trim() || !rulePattern.trim() || ruleActions.length === 0) {
      setRulesError('Rule name, pattern, and at least one action are required.')
      return
    }
    await runMutationWithToast(
      async () => {
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
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvalRules(projectId),
        })
        setCreateDialogOpen(false)
      },
      { successMessage: 'Approval rule created.' },
    )
  }

  const handleToggleRule = async (rule: ApprovalRuleDto) => {
    await runMutationWithToast(
      async () => {
        await api.updateApprovalRule(rule.id, { isActive: !rule.isActive })
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvalRules(projectId),
        })
      },
      { successMessage: rule.isActive ? 'Rule disabled.' : 'Rule enabled.' },
    )
  }

  const handleDeleteRule = async (ruleId: string) => {
    await runMutationWithToast(
      async () => {
        await api.deleteApprovalRule(ruleId)
        await queryClient.invalidateQueries({
          queryKey: queryKeys.approvalRules(projectId),
        })
      },
      { successMessage: 'Approval rule deleted.' },
    )
  }

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )
  useRegisterShortcut('n', () => setCreateDialogOpen(true))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Approval rules"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              navigate(projectPath(projectId, selectedProject?.slug))
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsErrorRaw || envErrorRaw || rulesErrorRaw || rulesError) && (
        <ErrorBanner
          message={
            rulesError ??
            getErrorMessage(projectsErrorRaw ?? envErrorRaw ?? rulesErrorRaw)
          }
        />
      )}

      <section className="border-border/60 bg-card/70 shadow-soft rounded-3xl border p-6">
        <SectionHeader
          kicker="Rules"
          title="Existing rules"
          action={
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(true)}
              disabled={!isAdmin}
            >
              <Plus className="h-4 w-4" />
              New rule
              <ShortcutHint keys="n" />
            </Button>
          }
        />
        <div className="mt-4 space-y-3">
          {rulesLoading ? (
            <EmptyState title="Loading rules..." />
          ) : rules.length === 0 ? (
            <EmptyState title="No rules yet." />
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="border-border/60 bg-background/60 flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-4"
              >
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {rule.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Env:{' '}
                    {rule.environmentId
                      ? (envById.get(rule.environmentId) ?? rule.environmentId)
                      : 'All'}{' '}
                    · Pattern: {rule.keyPattern}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Actions: {rule.actions.join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleToggleRule(rule)}
                    disabled={!isAdmin}
                  >
                    {rule.isActive ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="outline"
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

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle>Create approval rule</DialogTitle>
            <DialogDescription>
              Require approval for sensitive keys and actions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <label
                className="text-muted-foreground text-xs font-semibold"
                htmlFor="rule-name"
              >
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
              <label
                className="text-muted-foreground text-xs font-semibold"
                htmlFor="rule-environment"
              >
                Environment
              </label>
              <Select
                value={ruleEnvironmentId}
                onValueChange={setRuleEnvironmentId}
              >
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
              <label
                className="text-muted-foreground text-xs font-semibold"
                htmlFor="rule-pattern"
              >
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

          <div className="mt-2 space-y-2">
            <p className="text-muted-foreground text-xs font-semibold">
              Actions
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {(
                [
                  'CREATE',
                  'UPDATE',
                  'DELETE',
                  'ROLLBACK',
                  'COPY',
                  'COPY_FROM',
                ] as ApprovalAction[]
              ).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => toggleAction(action)}
                  disabled={!isAdmin}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    ruleActions.includes(action)
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-foreground/70 hover:border-foreground/40'
                  } ${!isAdmin ? 'opacity-60' : ''}`}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateDialogOpen(false)}
            >
              Close
            </Button>
            <Button onClick={handleCreateRule} disabled={!isAdmin}>
              Create rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
