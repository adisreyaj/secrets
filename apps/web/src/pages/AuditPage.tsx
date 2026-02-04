import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuditLogDto, AuditLogFilters, ProjectDto } from '@secrets/shared'
import { ArrowLeft } from 'lucide-react'
import { AuditLog } from '../components/AuditLog'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
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
import { useRegisterShortcut } from '../lib/shortcuts'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const AuditPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    start: '',
    end: '',
    action: '',
    resourceType: '',
    resourceId: '',
    actorType: 'user',
    actorId: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters | undefined>(undefined)

  const [retentionValue, setRetentionValue] = useState('90')
  const [retentionInitial, setRetentionInitial] = useState('90')
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionSaving, setRetentionSaving] = useState(false)
  const [retentionError, setRetentionError] = useState<string | null>(null)

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

  const loadAudit = useCallback(
    async (activeFilters?: AuditLogFilters) => {
      setAuditLoading(true)
      setAuditError(null)
      try {
        const data = await api.listAudit(projectId, activeFilters)
        setAuditLogs(data)
      } catch (error) {
        setAuditError(getErrorMessage(error))
      } finally {
        setAuditLoading(false)
      }
    },
    [projectId],
  )

  const loadRetention = useCallback(async () => {
    setRetentionLoading(true)
    setRetentionError(null)
    try {
      const data = await api.getAuditRetention(projectId)
      const nextValue = data.auditRetentionDays === null ? 'forever' : `${data.auditRetentionDays}`
      setRetentionValue(nextValue)
      setRetentionInitial(nextValue)
    } catch (error) {
      setRetentionError(getErrorMessage(error))
    } finally {
      setRetentionLoading(false)
    }
  }, [projectId])

  const handleApplyFilters = () => {
    setFilterError(null)
    const nextFilters: AuditLogFilters = {}

    if (filters.start) {
      const date = new Date(filters.start)
      if (Number.isNaN(date.getTime())) {
        setFilterError('Start date is invalid.')
        return
      }
      nextFilters.start = date.toISOString()
    }

    if (filters.end) {
      const date = new Date(filters.end)
      if (Number.isNaN(date.getTime())) {
        setFilterError('End date is invalid.')
        return
      }
      nextFilters.end = date.toISOString()
    }

    if (nextFilters.start && nextFilters.end && nextFilters.start > nextFilters.end) {
      setFilterError('Start date must be before end date.')
      return
    }

    if (filters.action.trim()) nextFilters.action = filters.action.trim()
    if (filters.resourceType.trim()) nextFilters.resourceType = filters.resourceType.trim()
    if (filters.resourceId.trim()) nextFilters.resourceId = filters.resourceId.trim()
    if (filters.actorId.trim()) {
      if (filters.actorType === 'user') {
        nextFilters.actorUserId = filters.actorId.trim()
      } else {
        nextFilters.actorServiceAccountId = filters.actorId.trim()
      }
    }

    setAppliedFilters(nextFilters)
    void loadAudit(nextFilters)
  }

  const handleClearFilters = () => {
    setFilters({
      start: '',
      end: '',
      action: '',
      resourceType: '',
      resourceId: '',
      actorType: 'user',
      actorId: '',
    })
    setAppliedFilters(undefined)
    setFilterError(null)
    void loadAudit()
  }

  const handleSaveRetention = async () => {
    if (retentionSaving) return
    setRetentionSaving(true)
    setRetentionError(null)
    try {
      const auditRetentionDays = retentionValue === 'forever' ? null : Number(retentionValue)
      const data = await api.updateAuditRetention(projectId, { auditRetentionDays })
      const nextValue = data.auditRetentionDays === null ? 'forever' : `${data.auditRetentionDays}`
      setRetentionValue(nextValue)
      setRetentionInitial(nextValue)
    } catch (error) {
      setRetentionError(getErrorMessage(error))
    } finally {
      setRetentionSaving(false)
    }
  }

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadAudit(appliedFilters)
      void loadRetention()
    }
  }, [user, loadProjects, loadAudit, loadRetention, appliedFilters])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const isAdmin = selectedProject?.role === 'ADMIN'
  const retentionDirty = retentionValue !== retentionInitial

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
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

      {(projectsError || auditError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || auditError}
        </div>
      )}

      <SectionCard>
        <SectionHeader kicker="Retention" title="Retention policy" />
        {retentionError ? (
          <p className="mt-3 text-sm text-rose-600">{retentionError}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="min-w-[220px]">
            <Select
              value={retentionValue}
              onValueChange={setRetentionValue}
              disabled={!isAdmin || retentionLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select retention" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">365 days</SelectItem>
                <SelectItem value="forever">Keep forever</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSaveRetention}
            disabled={!isAdmin || retentionLoading || retentionSaving || !retentionDirty}
            className="rounded-full px-4 py-2 text-sm"
          >
            {retentionSaving ? 'Saving...' : 'Save'}
          </Button>
          {!isAdmin ? (
            <p className="text-xs text-muted-foreground">
              Only admins can update retention settings.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Filters" title="Audit filters" />
        {filterError ? (
          <p className="mt-3 text-sm text-rose-600">{filterError}</p>
        ) : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Start
            </label>
            <Input
              type="datetime-local"
              value={filters.start}
              onChange={(event) => setFilters((prev) => ({ ...prev, start: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              End
            </label>
            <Input
              type="datetime-local"
              value={filters.end}
              onChange={(event) => setFilters((prev) => ({ ...prev, end: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Action
            </label>
            <Input
              placeholder="secret.update"
              value={filters.action}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, action: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resource type
            </label>
            <Input
              placeholder="secret"
              value={filters.resourceType}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, resourceType: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resource ID
            </label>
            <Input
              placeholder="Resource ID"
              value={filters.resourceId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, resourceId: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actor type
            </label>
            <Select
              value={filters.actorType}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, actorType: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select actor type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="service">Service account</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 lg:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actor ID
            </label>
            <Input
              placeholder="User or service account ID"
              value={filters.actorId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, actorId: event.target.value }))
              }
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleApplyFilters} className="rounded-full px-4 py-2 text-sm">
              Apply
            </Button>
            <Button
              variant="outline"
              onClick={handleClearFilters}
              className="rounded-full px-4 py-2 text-sm"
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="mt-6 border-t border-border/60 pt-6">
          <AuditLog audits={auditLogs} loading={auditLoading} error={auditError} withCard={false} />
        </div>
      </SectionCard>
    </section>
  )
}
