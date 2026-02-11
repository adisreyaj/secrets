import type {
  EnvironmentDto,
  FeatureFlagDto,
  FeatureFlagEnvironmentDiffDto,
  ProjectDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet'
import { Textarea } from '../components/ui/textarea'
import { api } from '../lib/api'
import { createEnvironmentAndRefresh } from '../lib/environmentMutations'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { getProjectModuleState } from '../lib/modules'
import {
  flagEnvironmentPath,
  flagEnvironmentsPath,
  flagSdkKeysPath,
  flagsPath,
} from '../lib/paths'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { invalidateQueryKeys } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { getLastEnvironmentId } from '../lib/shortcuts.utils'
import { useRequireAuth } from '../lib/useRequireAuth'
import {
  emptyFlagFormState,
  toFlagMutationPayload,
  type FlagFormState,
  validateFlagForm,
} from './FlagsPage.form'
import { EnvironmentTabsCard } from './environment/EnvironmentTabsCard'

type FlagsPageProps = {
  projectId: string
  environmentId: string
  navigate: (path: string) => void
}

export const FlagsPage = ({ projectId, environmentId, navigate }: FlagsPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingFlagId, setEditingFlagId] = useState<string | null>(null)
  const [form, setForm] = useState<FlagFormState>(emptyFlagFormState)
  const [saving, setSaving] = useState(false)

  const [diffOpen, setDiffOpen] = useState(false)
  const [diffFlag, setDiffFlag] = useState<FeatureFlagDto | null>(null)
  const [diffToEnvironmentId, setDiffToEnvironmentId] = useState<string>('')
  const [diffResult, setDiffResult] = useState<FeatureFlagEnvironmentDiffDto | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const { data: modulesData } = useQuery({
    queryKey: queryKeys.projectModules(projectId),
    queryFn: () => api.listProjectModules(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const {
    data: environmentsData,
    isLoading: environmentsLoading,
    error: environmentsErrorRaw,
  } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const environments = asArray(environmentsData)
  const selectedEnvironment = useMemo(
    () => environments.find((env) => env.id === environmentId) ?? null,
    [environments, environmentId],
  )

  useEffect(() => {
    if (!projectId || environmentsLoading || environments.length === 0 || selectedEnvironment) {
      return
    }
    const lastEnvironmentId = getLastEnvironmentId(projectId)
    const fallbackEnvironment =
      environments.find((env) => env.id === lastEnvironmentId) ?? environments[0]
    if (!fallbackEnvironment) return
    navigate(flagsPath(projectId, undefined, fallbackEnvironment.id))
  }, [projectId, environments, environmentsLoading, selectedEnvironment, navigate])

  const activeEnvironmentId = selectedEnvironment?.id ?? null

  const {
    data: flagsData,
    isLoading: flagsLoading,
    error: flagsErrorRaw,
  } = useQuery<FeatureFlagDto[]>({
    queryKey: queryKeys.flags(projectId, activeEnvironmentId),
    queryFn: () => api.listFlags(projectId, activeEnvironmentId),
    enabled: Boolean(user) && Boolean(projectId) && Boolean(activeEnvironmentId),
  })

  const projects = asArray(projectsData)
  const flags = asArray(flagsData)
  const moduleState = useMemo(() => getProjectModuleState(modulesData), [modulesData])
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () => navigate(flagEnvironmentsPath(projectId, selectedProject?.slug)))
  useRegisterShortcut('n', () => setSheetOpen(true))

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => createEnvironmentAndRefresh(queryClient, projectId, payload)

  const resetForm = () => {
    setForm(emptyFlagFormState)
    setEditingFlagId(null)
  }

  const openCreate = () => {
    resetForm()
    setSheetOpen(true)
  }

  const openEdit = (flag: FeatureFlagDto) => {
    setEditingFlagId(flag.id)
    setForm({
      key: flag.key,
      name: flag.name,
      description: flag.description ?? '',
      valueType: flag.valueType,
      enabled: flag.enabled,
      runtime: flag.runtime,
      labels: (flag.labels ?? []).join(', '),
      booleanValue: flag.booleanValue ?? true,
      defaultVariantKey: flag.multivariate?.defaultVariantKey ?? '',
      variants: flag.multivariate?.variants ?? [],
    })
    setSheetOpen(true)
  }

  const saveFlag = async () => {
    if (!activeEnvironmentId || saving) return

    const validationError = validateFlagForm(form)
    if (validationError) {
      await runMutationWithToast(async () => {
        throw new Error(validationError)
      })
      return
    }

    setSaving(true)
    const payload = toFlagMutationPayload(form, activeEnvironmentId)

    await runMutationWithToast(
      async () => {
        if (editingFlagId) {
          await api.updateFlag(editingFlagId, payload)
        } else {
          await api.createFlag(projectId, payload)
        }
        await invalidateQueryKeys(
          queryClient,
          queryKeys.flags(projectId, activeEnvironmentId),
        )
      },
      { successMessage: editingFlagId ? 'Flag updated.' : 'Flag created.' },
    )

    setSaving(false)
    setSheetOpen(false)
    resetForm()
  }

  const deleteFlag = async (flagId: string) => {
    if (!activeEnvironmentId) return
    await runMutationWithToast(
      async () => {
        await api.deleteFlag(flagId, activeEnvironmentId)
        await invalidateQueryKeys(
          queryClient,
          queryKeys.flags(projectId, activeEnvironmentId),
        )
      },
      { successMessage: 'Flag deleted.' },
    )
  }

  const openDiff = (flag: FeatureFlagDto) => {
    const fallback = environments.find((environment) => environment.id !== environmentId)
    setDiffFlag(flag)
    setDiffToEnvironmentId(fallback?.id ?? '')
    setDiffResult(null)
    setDiffOpen(true)
  }

  const loadDiff = async () => {
    if (!diffFlag || !diffToEnvironmentId || !activeEnvironmentId) return
    setDiffLoading(true)
    try {
      const diff = await api.getFlagDiff(diffFlag.id, activeEnvironmentId, diffToEnvironmentId)
      setDiffResult(diff)
    } catch (error) {
      await runMutationWithToast(async () => {
        throw error
      })
    } finally {
      setDiffLoading(false)
    }
  }

  const projectsError = projectsErrorRaw ? getErrorMessage(projectsErrorRaw) : null
  const flagsError = flagsErrorRaw ? getErrorMessage(flagsErrorRaw) : null
  const environmentsError = environmentsErrorRaw ? getErrorMessage(environmentsErrorRaw) : null

  if (!moduleState.flags) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Feature flags"
          subtitle="This module is disabled for this project."
          actions={
            <Button variant="outline" onClick={() => navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))}>
              <ArrowLeft className="h-4 w-4" />
              Back to environments
            </Button>
          }
        />
      </section>
    )
  }

  if (environmentsLoading && !selectedEnvironment) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Feature flags"
          subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        />
        <SectionCard>
          <p className="text-muted-foreground text-sm">Loading environments...</p>
        </SectionCard>
      </section>
    )
  }

  if (environments.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Feature flags"
          subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
          actions={
            <Button variant="outline" onClick={() => navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))}>
              Create environment
            </Button>
          }
        />
        <SectionCard>
          <p className="text-muted-foreground text-sm">
            No environments found. Create an environment to manage flags.
          </p>
        </SectionCard>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Feature flags"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(flagSdkKeysPath(projectId, selectedProject?.slug, activeEnvironmentId))}
              disabled={!activeEnvironmentId}
            >
              SDK keys
            </Button>
            <Button variant="outline" onClick={() => navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))}>
              <ArrowLeft className="h-4 w-4" />
              Back to environments
              <ShortcutHint keys="b" />
            </Button>
          </div>
        }
      />

      {(projectsError || flagsError || environmentsError) && (
        <ErrorBanner message={projectsError || flagsError || environmentsError} />
      )}

      <section className="flex flex-col gap-0">
        <EnvironmentTabsCard
          environments={environments}
          envLoading={environmentsLoading}
          environmentId={environmentId}
          onSelectEnvironment={(envId) =>
            navigate(flagEnvironmentPath(projectId, selectedProject?.slug, envId))
          }
          environmentOptions={environments.map((env) => ({ id: env.id, name: env.name }))}
          onCreateEnvironment={handleCreateEnvironment}
        />
      </section>

      <SectionCard>
        <SectionHeader
          kicker="Flags"
          title="List"
          action={
            <Button variant="outline" onClick={openCreate} disabled={!activeEnvironmentId}>
              <Plus className="h-4 w-4" />
              New flag
              <ShortcutHint keys="n" />
            </Button>
          }
        />
        <div className="mt-4 space-y-3">
          {flagsLoading ? (
            <p className="text-muted-foreground text-sm">Loading flags...</p>
          ) : flags.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flags yet. Create your first flag.</p>
          ) : (
            flags.map((flag) => (
              <div key={flag.id} className="border-border/70 bg-card/70 rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => openEdit(flag)} className="flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-foreground text-sm font-semibold">{flag.name}</p>
                      <Badge variant="outline">{flag.valueType}</Badge>
                      <Badge variant="secondary">{flag.runtime}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">{flag.key}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {flag.enabled ? 'Enabled' : 'Disabled'} · Updated {formatDate(flag.updatedAt)}
                    </p>
                    {flag.labels.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {flag.labels.map((label) => (
                          <Badge key={label} variant="secondary">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openDiff(flag)}>
                      Compare
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteFlag(flag.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingFlagId ? 'Edit flag' : 'Create flag'}</SheetTitle>
            <SheetDescription>
              Configure this flag for {selectedEnvironment?.name ?? 'the selected environment'}.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5 overflow-y-auto pb-24">
            <section className="space-y-3">
              <p className="muted-label">Basics</p>
              <Input
                value={form.key}
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="Flag key"
                disabled={Boolean(editingFlagId)}
              />
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Flag name"
              />
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Description"
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.enabled}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, enabled: Boolean(checked) }))
                  }
                />
                Enabled
              </label>
            </section>

            <section className="space-y-3">
              <p className="muted-label">Type and value</p>
              <Select
                value={form.valueType}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    valueType: value as 'BOOLEAN' | 'MULTIVARIATE',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                  <SelectItem value="MULTIVARIATE">MULTIVARIATE</SelectItem>
                </SelectContent>
              </Select>

              {form.valueType === 'BOOLEAN' ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.booleanValue}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, booleanValue: Boolean(checked) }))
                    }
                  />
                  Boolean value
                </label>
              ) : (
                <div className="space-y-3">
                  <Input
                    value={form.defaultVariantKey}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, defaultVariantKey: event.target.value }))
                    }
                    placeholder="Default variant key"
                  />
                  <div className="space-y-2">
                    {form.variants.map((variant, index) => (
                      <div key={`${variant.key}-${index}`} className="rounded-lg border p-3 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            value={variant.key}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                variants: current.variants.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, key: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                            placeholder="Variant key"
                          />
                          <Select
                            value={variant.valueType}
                            onValueChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                variants: current.variants.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, valueType: value as 'string' | 'json' }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="json">JSON</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Textarea
                          value={variant.value}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              variants: current.variants.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                          placeholder={variant.valueType === 'json' ? '{"key":"value"}' : 'Variant value'}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              variants: current.variants.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove variant
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          variants: [
                            ...current.variants,
                            { key: '', valueType: 'string', value: '' },
                          ],
                        }))
                      }
                    >
                      Add variant
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <p className="muted-label">Evaluation runtime</p>
              <div className="grid gap-2 md:grid-cols-3">
                {[
                  { value: 'both', label: 'Both client and server' },
                  { value: 'client', label: 'Client-side only' },
                  { value: 'server', label: 'Server-side only' },
                ].map((runtimeOption) => (
                  <Button
                    key={runtimeOption.value}
                    type="button"
                    variant={form.runtime === runtimeOption.value ? 'default' : 'outline'}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        runtime: runtimeOption.value as 'both' | 'client' | 'server',
                      }))
                    }
                  >
                    {runtimeOption.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <p className="muted-label">Labels</p>
              <Input
                value={form.labels}
                onChange={(event) => setForm((current) => ({ ...current, labels: event.target.value }))}
                placeholder="payments, beta, checkout"
              />
              <p className="text-muted-foreground text-xs">Comma-separated labels.</p>
            </section>
          </div>

          <div className="bg-background absolute right-0 bottom-0 left-0 border-t p-4">
            <Button className="w-full" onClick={saveFlag} disabled={saving}>
              {saving ? 'Saving...' : editingFlagId ? 'Save changes' : 'Create flag'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
          <DialogHeader>
            <DialogTitle>Compare environments</DialogTitle>
            <DialogDescription>
              Compare values for <span className="font-semibold">{diffFlag?.key ?? 'selected flag'}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">From: {selectedEnvironment?.name ?? environmentId}</p>
            <Select value={diffToEnvironmentId} onValueChange={setDiffToEnvironmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target environment" />
              </SelectTrigger>
              <SelectContent>
                {environments
                  .filter((environment) => environment.id !== environmentId)
                  .map((environment) => (
                    <SelectItem key={environment.id} value={environment.id}>
                      {environment.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={loadDiff} disabled={!diffToEnvironmentId || diffLoading}>
              {diffLoading ? 'Comparing...' : 'Compare'}
            </Button>

            {diffResult ? (
              <div className="rounded-xl border p-3 text-sm">
                <div className="grid gap-1">
                  <p>Enabled changed: {diffResult.differences.enabled ? 'Yes' : 'No'}</p>
                  <p>Runtime changed: {diffResult.differences.runtime ? 'Yes' : 'No'}</p>
                  <p>Labels changed: {diffResult.differences.labels ? 'Yes' : 'No'}</p>
                  <p>Value changed: {diffResult.differences.value ? 'Yes' : 'No'}</p>
                </div>
                <pre className="bg-muted mt-3 max-h-56 overflow-auto rounded-md p-2 text-xs">
                  {JSON.stringify(diffResult, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiffOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
