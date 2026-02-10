import type { FeatureFlagDto, ProjectDto } from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { getProjectModuleState } from '../lib/modules'
import { projectPath } from '../lib/paths'
import { runMutationWithToast } from '../lib/mutationFeedback'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

type FlagsPageProps = {
  projectId: string
  navigate: (path: string) => void
}

type FlagFormState = {
  key: string
  name: string
  description: string
  valueType: 'BOOLEAN' | 'MULTIVARIATE'
  enabled: boolean
}

const emptyForm: FlagFormState = {
  key: '',
  name: '',
  description: '',
  valueType: 'BOOLEAN',
  enabled: true,
}

export const FlagsPage = ({ projectId, navigate }: FlagsPageProps) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null)
  const [form, setForm] = useState<FlagFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

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
    data: flagsData,
    isLoading: flagsLoading,
    error: flagsErrorRaw,
  } = useQuery<FeatureFlagDto[]>({
    queryKey: queryKeys.flags(projectId),
    queryFn: () => api.listFlags(projectId),
    enabled: Boolean(user) && Boolean(projectId),
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
  const selectedFlag = useMemo(
    () => flags.find((flag) => flag.id === selectedFlagId) ?? null,
    [flags, selectedFlagId],
  )

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  const resetForm = () => {
    setSelectedFlagId(null)
    setForm(emptyForm)
  }

  const populateForm = (flag: FeatureFlagDto) => {
    setSelectedFlagId(flag.id)
    setForm({
      key: flag.key,
      name: flag.name,
      description: flag.description ?? '',
      valueType: flag.valueType,
      enabled: flag.enabled,
    })
  }

  const saveFlag = async () => {
    if (!form.key.trim() || !form.name.trim() || saving) return
    setSaving(true)
    const result = await runMutationWithToast(
      async () => {
        if (selectedFlagId) {
          await api.updateFlag(selectedFlagId, {
            key: form.key.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            valueType: form.valueType,
            enabled: form.enabled,
          })
        } else {
          await api.createFlag(projectId, {
            key: form.key.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            valueType: form.valueType,
            enabled: form.enabled,
          })
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.flags(projectId) })
      },
      { successMessage: selectedFlagId ? 'Flag updated.' : 'Flag created.' },
    )
    if (result !== false && !selectedFlagId) {
      resetForm()
    }
    setSaving(false)
  }

  const deleteFlag = async (flagId: string) => {
    await runMutationWithToast(
      async () => {
        await api.deleteFlag(flagId)
        await queryClient.invalidateQueries({ queryKey: queryKeys.flags(projectId) })
      },
      { successMessage: 'Flag deleted.' },
    )
    if (selectedFlagId === flagId) {
      resetForm()
    }
  }

  const projectsError = projectsErrorRaw ? getErrorMessage(projectsErrorRaw) : null
  const flagsError = flagsErrorRaw ? getErrorMessage(flagsErrorRaw) : null

  if (!moduleState.flags) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Feature flags"
          subtitle="This module is disabled for this project."
          actions={
            <Button
              variant="outline"
              onClick={() => navigate(projectPath(projectId, selectedProject?.slug))}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to overview
            </Button>
          }
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Feature flags"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(projectPath(projectId, selectedProject?.slug))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || flagsError) && (
        <ErrorBanner message={projectsError || flagsError} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard>
          <SectionHeader
            kicker="Flags"
            title="List"
            action={
              <Button variant="outline" onClick={resetForm}>
                <Plus className="h-4 w-4" />
                New flag
              </Button>
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
                      onClick={() => populateForm(flag)}
                      className="flex-1 text-left"
                    >
                      <p className="text-foreground text-sm font-semibold">{flag.name}</p>
                      <p className="text-muted-foreground text-xs">{flag.key}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {flag.valueType} · {flag.enabled ? 'Enabled' : 'Disabled'} · Updated{' '}
                        {formatDate(flag.updatedAt)}
                      </p>
                    </button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteFlag(flag.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader
            kicker="Editor"
            title={selectedFlag ? `Edit ${selectedFlag.name}` : 'Create flag'}
          />
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Key</p>
              <Input
                value={form.key}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, key: event.target.value }))
                }
                placeholder="new_checkout"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Name</p>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="New checkout experience"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Description</p>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Flag purpose and rollout notes"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Type</p>
              <Select
                value={form.valueType}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
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
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: Boolean(checked) }))
                }
              />
              Enabled
            </label>
            <Button className="w-full" disabled={saving} onClick={saveFlag}>
              {selectedFlag ? 'Save changes' : 'Create flag'}
            </Button>
          </div>
        </SectionCard>
      </div>
    </section>
  )
}
