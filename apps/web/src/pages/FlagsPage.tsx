import type {
  EnvironmentDto,
  FeatureFlagDto,
  ProjectDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { JsonCodeEditor } from '../components/ui/json-code-editor'
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
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { api } from '../lib/api'
import { createEnvironmentAndRefresh } from '../lib/environmentMutations'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { getProjectModuleState } from '../lib/modules'
import { runMutationWithToast } from '../lib/mutationFeedback'
import {
  flagEnvironmentPath,
  flagEnvironmentsPath,
  flagSdkKeysPath,
  flagsMatrixPath,
  flagsPath,
} from '../lib/paths'
import { invalidateQueryKeys } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { getLastEnvironmentId } from '../lib/shortcuts.utils'
import { useRequireAuth } from '../lib/useRequireAuth'
import {
  emptyCreateFlagFormState,
  emptyEditFlagFormState,
  toCreateFlagMutationPayload,
  toEditFlagMutationPayload,
  validateCreateFlagForm,
  validateEditFlagForm,
  type CreateFlagFormState,
  type EditFlagFormState,
} from './FlagsPage.form'
import { EnvironmentTabsCard } from './environment/EnvironmentTabsCard'

type FlagsPageProps = {
  projectId: string
  environmentId: string
  navigate: (path: string) => void
}

const runtimeOptions = [
  { value: 'both', label: 'Both client and server' },
  { value: 'client', label: 'Client-side only' },
  { value: 'server', label: 'Server-side only' },
] as const

export const FlagsPage = ({
  projectId,
  environmentId,
  navigate,
}: FlagsPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingFlagId, setEditingFlagId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateFlagFormState>(
    emptyCreateFlagFormState,
  )
  const [editForm, setEditForm] = useState<EditFlagFormState>(
    emptyEditFlagFormState,
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: projectsData, error: projectsErrorRaw } = useQuery<
    ProjectDto[]
  >({
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
    if (
      !projectId ||
      environmentsLoading ||
      environments.length === 0 ||
      selectedEnvironment
    ) {
      return
    }
    const lastEnvironmentId = getLastEnvironmentId(projectId)
    const fallbackEnvironment =
      environments.find((env) => env.id === lastEnvironmentId) ??
      environments[0]
    if (!fallbackEnvironment) return
    navigate(flagsPath(projectId, undefined, fallbackEnvironment.id))
  }, [
    projectId,
    environments,
    environmentsLoading,
    selectedEnvironment,
    navigate,
  ])

  const activeEnvironmentId = selectedEnvironment?.id ?? null

  const {
    data: flagsData,
    isLoading: flagsLoading,
    error: flagsErrorRaw,
  } = useQuery<FeatureFlagDto[]>({
    queryKey: queryKeys.flags(projectId, activeEnvironmentId),
    queryFn: () => api.listFlags(projectId, activeEnvironmentId),
    enabled:
      Boolean(user) && Boolean(projectId) && Boolean(activeEnvironmentId),
  })

  const projects = asArray(projectsData)
  const flags = asArray(flagsData)
  const moduleState = useMemo(
    () => getProjectModuleState(modulesData),
    [modulesData],
  )
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  useRegisterShortcut('b', () =>
    navigate(flagEnvironmentsPath(projectId, selectedProject?.slug)),
  )
  useRegisterShortcut('n', () => setSheetOpen(true))

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => createEnvironmentAndRefresh(queryClient, projectId, payload)

  const resetForm = () => {
    setCreateForm({
      ...emptyCreateFlagFormState,
      environmentId: activeEnvironmentId ?? '',
    })
    setEditForm({
      ...emptyEditFlagFormState,
      environmentId: activeEnvironmentId ?? '',
    })
    setAdvancedOpen(false)
    setEditingFlagId(null)
  }

  const openCreate = () => {
    resetForm()
    setCreateForm((current) => ({
      ...current,
      environmentId: activeEnvironmentId ?? '',
    }))
    setSheetOpen(true)
  }

  const openEdit = (flag: FeatureFlagDto) => {
    setEditingFlagId(flag.id)
    setAdvancedOpen(false)
    const formatJsonValue = (value: unknown) => {
      try {
        return JSON.stringify(value ?? null, null, 2)
      } catch {
        return 'null'
      }
    }
    setEditForm({
      environmentId: activeEnvironmentId ?? '',
      key: flag.key,
      description: flag.description ?? '',
      valueType: flag.valueType,
      exposed: flag.exposed,
      runtime: flag.runtime,
      labels: (flag.labels ?? []).join(', '),
      booleanValue: flag.booleanValue ?? true,
      jsonValue: formatJsonValue(flag.jsonValue),
    })
    setSheetOpen(true)
  }

  const saveFlag = async () => {
    if (!activeEnvironmentId || saving) return

    const validationError = editingFlagId
      ? validateEditFlagForm(editForm)
      : validateCreateFlagForm(createForm)
    if (validationError) {
      await runMutationWithToast(async () => {
        throw new Error(validationError)
      })
      return
    }

    setSaving(true)
    try {
      const payload = editingFlagId
        ? toEditFlagMutationPayload(editForm)
        : toCreateFlagMutationPayload(createForm)

      const result = await runMutationWithToast(
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
          return true
        },
        {
          successMessage: editingFlagId
            ? 'Flag updated.'
            : 'Flag created. Switch environments to customize values.',
        },
      )

      if (!result) {
        return
      }

      setSheetOpen(false)
      resetForm()
    } finally {
      setSaving(false)
    }
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

  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null
  const flagsError = flagsErrorRaw ? getErrorMessage(flagsErrorRaw) : null
  const environmentsError = environmentsErrorRaw
    ? getErrorMessage(environmentsErrorRaw)
    : null

  if (!moduleState.flags) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Feature flags"
          subtitle="This module is disabled for this project."
          actions={
            <Button
              variant="outline"
              onClick={() =>
                navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))
              }
            >
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
          <p className="text-muted-foreground text-sm">
            Loading environments...
          </p>
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
            <Button
              variant="outline"
              onClick={() =>
                navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))
              }
            >
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
              onClick={() =>
                navigate(
                  flagSdkKeysPath(
                    projectId,
                    selectedProject?.slug,
                    activeEnvironmentId,
                  ),
                )
              }
              disabled={!activeEnvironmentId}
            >
              SDK keys
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))
              }
            >
              <ArrowLeft className="h-4 w-4" />
              Back to environments
              <ShortcutHint keys="b" />
            </Button>
          </div>
        }
      />

      {(projectsError || flagsError || environmentsError) && (
        <ErrorBanner
          message={projectsError || flagsError || environmentsError}
        />
      )}

      <section className="flex flex-col gap-0">
        <EnvironmentTabsCard
          environments={environments}
          envLoading={environmentsLoading}
          environmentId={environmentId}
          onSelectEnvironment={(envId) =>
            navigate(
              flagEnvironmentPath(projectId, selectedProject?.slug, envId),
            )
          }
          environmentOptions={environments.map((env) => ({
            id: env.id,
            name: env.name,
          }))}
          onCreateEnvironment={handleCreateEnvironment}
        />
        <SectionCard className="rounded-t-none border-t-0">
          <SectionHeader
            kicker="Flags"
            title="List"
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate(flagsMatrixPath(projectId, selectedProject?.slug))
                  }
                >
                  Compare matrix
                </Button>
                <Button
                  variant="default"
                  onClick={openCreate}
                  disabled={!activeEnvironmentId}
                >
                  <Plus className="h-4 w-4" />
                  New flag
                  <ShortcutHint keys="n" />
                </Button>
              </div>
            }
          />
          <div className="mt-4 space-y-3">
            {flagsLoading ? (
              <p className="text-muted-foreground text-sm">Loading flags...</p>
            ) : flags.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No flags yet. Create your first flag.
              </p>
            ) : (
              flags.map((flag) => (
                <div
                  key={flag.id}
                  className="border-border/70 bg-card/70 rounded-2xl border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(flag)}
                      className="flex-1 text-left"
                    >
                      <p className="text-foreground text-sm font-semibold">
                        {flag.key}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Value:{' '}
                        {flag.valueType === 'BOOLEAN'
                          ? flag.booleanValue
                            ? 'true'
                            : 'false'
                          : JSON.stringify(flag.jsonValue ?? null)}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {flag.exposed ? 'Exposed' : 'Hidden'} · Updated{' '}
                        {formatDate(flag.updatedAt)}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            flagsMatrixPath(projectId, selectedProject?.slug),
                          )
                        }
                      >
                        Compare
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteFlag(flag.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col p-0 sm:max-w-xl">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>
              {editingFlagId ? 'Edit flag' : 'Create flag'}
            </SheetTitle>
            <SheetDescription>
              {editingFlagId
                ? 'Update this flag for the selected environment.'
                : 'Create a boolean or JSON flag. Configure advanced options if needed.'}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
            {editingFlagId ? (
              <>
                <section className="space-y-3">
                  <p className="muted-label">Basics</p>
                  <label className="muted-label" htmlFor="edit-flag-key">
                    Flag key
                  </label>
                  <Input
                    id="edit-flag-key"
                    value={editForm.key}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        key: event.target.value,
                      }))
                    }
                    placeholder="e.g. checkout_new_flow"
                    disabled
                  />
                  <label
                    className="muted-label"
                    htmlFor="edit-flag-description"
                  >
                    Description
                  </label>
                  <Textarea
                    id="edit-flag-description"
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="e.g. Enables the redesigned checkout experience."
                  />
                </section>

                <section className="space-y-3">
                  <p className="muted-label">Visibility</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={editForm.exposed}
                        onCheckedChange={(checked) =>
                          setEditForm((current) => ({
                            ...current,
                            exposed: checked === true,
                          }))
                        }
                      />
                      <span className="text-sm">Visible to consumers</span>
                    </label>
                    <p className="text-muted-foreground text-xs">
                      {editForm.exposed
                        ? 'Exposed to consumers'
                        : 'Hidden from consumers'}
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="muted-label">Type and value</p>
                  <label className="muted-label" htmlFor="edit-flag-value-type">
                    Value type
                  </label>
                  <Select
                    value={editForm.valueType}
                  >
                    <SelectTrigger id="edit-flag-value-type" disabled>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOOLEAN">Boolean</SelectItem>
                      <SelectItem value="JSON">Json</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Value type is fixed after creation.
                  </p>

                  {editForm.valueType === 'BOOLEAN' ? (
                    <div className="space-y-2">
                      <p className="muted-label">Boolean value</p>
                      <Switch
                        checked={editForm.booleanValue}
                        onCheckedChange={(checked) =>
                          setEditForm((current) => ({
                            ...current,
                            booleanValue: checked,
                          }))
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        {editForm.booleanValue ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label
                        className="muted-label"
                        htmlFor="edit-flag-json-value"
                      >
                        JSON value
                      </label>
                      <JsonCodeEditor
                        id="edit-flag-json-value"
                        className="min-h-40 font-mono text-xs"
                        value={editForm.jsonValue}
                        onChange={(value) =>
                          setEditForm((current) => ({
                            ...current,
                            jsonValue: value,
                          }))
                        }
                        placeholder='{"enabled":true}'
                      />
                      <p className="text-muted-foreground text-xs">
                        Enter valid JSON for this flag value.
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <p className="muted-label">Evaluation runtime</p>
                  <Select
                    value={editForm.runtime}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        runtime: value as 'both' | 'client' | 'server',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {runtimeOptions.map((runtimeOption) => (
                        <SelectItem
                          key={runtimeOption.value}
                          value={runtimeOption.value}
                        >
                          {runtimeOption.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>

                <section className="space-y-3">
                  <p className="muted-label">Labels</p>
                  <label className="muted-label" htmlFor="edit-flag-labels">
                    Labels
                  </label>
                  <Input
                    id="edit-flag-labels"
                    value={editForm.labels}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        labels: event.target.value,
                      }))
                    }
                    placeholder="payments, beta, checkout"
                  />
                  <p className="text-muted-foreground text-xs">
                    Comma-separated labels.
                  </p>
                </section>
              </>
            ) : (
              <>
                <section className="space-y-4">
                  <label className="muted-label" htmlFor="create-flag-key">
                    Flag key
                  </label>
                  <Input
                    id="create-flag-key"
                    value={createForm.key}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        key: event.target.value,
                      }))
                    }
                    placeholder="e.g. checkout_new_flow"
                  />
                  <label
                    className="muted-label"
                    htmlFor="create-flag-value-type"
                  >
                    Value type
                  </label>
                  <Select
                    value={createForm.valueType}
                    onValueChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        valueType: value as 'BOOLEAN' | 'JSON',
                      }))
                    }
                  >
                    <SelectTrigger id="create-flag-value-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOOLEAN">Boolean</SelectItem>
                      <SelectItem value="JSON">Json</SelectItem>
                    </SelectContent>
                  </Select>
                  {createForm.valueType === 'BOOLEAN' ? (
                    <div className="space-y-3">
                      <p className="muted-label">Boolean value</p>
                      <Switch
                        checked={createForm.booleanValue}
                        onCheckedChange={(checked) =>
                          setCreateForm((current) => ({
                            ...current,
                            booleanValue: checked,
                          }))
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        {createForm.booleanValue ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label
                        className="muted-label"
                        htmlFor="create-flag-json-value"
                      >
                        JSON value
                      </label>
                      <JsonCodeEditor
                        id="create-flag-json-value"
                        className="min-h-40 font-mono text-xs"
                        value={createForm.jsonValue}
                        onChange={(value) =>
                          setCreateForm((current) => ({
                            ...current,
                            jsonValue: value,
                          }))
                        }
                        placeholder='{"enabled":true}'
                      />
                      <p className="text-muted-foreground text-xs">
                        Enter valid JSON for this flag value.
                      </p>
                    </div>
                  )}
                </section>

                <section className="border-border/70 space-y-3 border-t pt-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                    onClick={() => setAdvancedOpen((current) => !current)}
                    aria-expanded={advancedOpen}
                  >
                    <span>Advanced</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        advancedOpen ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  </button>

                  {advancedOpen ? (
                    <div className="space-y-6 pt-1">
                      <section className="space-y-4">
                        <label
                          className="muted-label"
                          htmlFor="create-flag-description"
                        >
                          Description
                        </label>
                        <Textarea
                          id="create-flag-description"
                          value={createForm.description}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="e.g. Enables the redesigned checkout experience."
                        />
                      </section>

                      <section className="space-y-4">
                        <p className="muted-label">Visibility</p>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={createForm.exposed}
                            onCheckedChange={(checked) =>
                              setCreateForm((current) => ({
                                ...current,
                                exposed: checked === true,
                              }))
                            }
                          />
                          <span className="text-sm">Visible to consumers</span>
                        </label>
                      </section>

                      <section className="space-y-4">
                        <p className="muted-label">Evaluation runtime</p>
                        <Select
                          value={createForm.runtime}
                          onValueChange={(value) =>
                            setCreateForm((current) => ({
                              ...current,
                              runtime: value as 'both' | 'client' | 'server',
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {runtimeOptions.map((runtimeOption) => (
                              <SelectItem
                                key={runtimeOption.value}
                                value={runtimeOption.value}
                              >
                                {runtimeOption.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </section>

                      <section className="space-y-4">
                        <label
                          className="muted-label"
                          htmlFor="create-flag-labels"
                        >
                          Labels
                        </label>
                        <Input
                          id="create-flag-labels"
                          value={createForm.labels}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              labels: event.target.value,
                            }))
                          }
                          placeholder="payments, beta, checkout"
                        />
                        <p className="text-muted-foreground text-xs">
                          Comma-separated labels.
                        </p>
                      </section>
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </div>

          <div className="border-border/70 bg-background/95 border-t px-6 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSheetOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveFlag} disabled={saving}>
                {saving
                  ? 'Saving...'
                  : editingFlagId
                    ? 'Save changes'
                    : 'Create flag'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
