import type { AuditLogDto, AuditLogFilters, ProjectDto } from '@secrets/shared'
import { endOfDay, format, startOfDay } from 'date-fns'
import { ArrowLeft, CalendarIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { AuditLog } from '../components/AuditLog'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard, SectionHeader } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Calendar } from '../components/ui/calendar'
import {
  controlBaseClasses,
  controlSizeClasses,
  controlVariantClasses,
} from '../components/ui/control-classes'
import { Input } from '../components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useAsyncResource } from '../lib/useAsyncResource'
import { useRequireAuth } from '../lib/useRequireAuth'
import { cn } from '../lib/utils'

type AuditFilterState = {
  action: string
  resourceType: string
  resourceId: string
  actorType: 'user' | 'service'
  actorId: string
  dateRange?: DateRange
}

export const AuditPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const { data: projectsData, error: projectsError } = useAsyncResource<
    ProjectDto[]
  >(async () => (user ? api.listProjects() : []), [user])
  const projects = projectsData ?? []

  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AuditFilterState>({
    action: '',
    resourceType: '',
    resourceId: '',
    actorType: 'user',
    actorId: '',
    dateRange: undefined,
  })
  const [appliedFilters, setAppliedFilters] = useState<
    AuditLogFilters | undefined
  >(undefined)

  const [retentionValue, setRetentionValue] = useState('90')
  const [retentionInitial, setRetentionInitial] = useState('90')
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionSaving, setRetentionSaving] = useState(false)
  const [retentionError, setRetentionError] = useState<string | null>(null)
  const [allActions, setAllActions] = useState<string[]>([])
  const [allResourceTypes, setAllResourceTypes] = useState<string[]>([])


  const loadAudit = useCallback(
    async (activeFilters?: AuditLogFilters) => {
      setAuditLoading(true)
      setAuditError(null)
      try {
        const data = await api.listAudit(projectId, activeFilters)
        setAuditLogs(data)
        if (!activeFilters) {
          const actions = Array.from(
            new Set(data.map((log) => log.action).filter(Boolean)),
          ).sort()
          const resourceTypes = Array.from(
            new Set(data.map((log) => log.resourceType).filter(Boolean)),
          ).sort()
          setAllActions(actions)
          setAllResourceTypes(resourceTypes)
        }
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
      const nextValue =
        data.auditRetentionDays === null
          ? 'forever'
          : `${data.auditRetentionDays}`
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

    if (filters.dateRange?.from) {
      nextFilters.start = startOfDay(filters.dateRange.from).toISOString()
    }
    if (filters.dateRange?.to) {
      nextFilters.end = endOfDay(filters.dateRange.to).toISOString()
    }
    if (filters.action.trim()) nextFilters.action = filters.action.trim()
    if (filters.resourceType.trim())
      nextFilters.resourceType = filters.resourceType.trim()
    if (filters.resourceId.trim())
      nextFilters.resourceId = filters.resourceId.trim()
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
      action: '',
      resourceType: '',
      resourceId: '',
      actorType: 'user',
      actorId: '',
      dateRange: undefined,
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
      const auditRetentionDays =
        retentionValue === 'forever' ? null : Number(retentionValue)
      const data = await api.updateAuditRetention(projectId, {
        auditRetentionDays,
      })
      const nextValue =
        data.auditRetentionDays === null
          ? 'forever'
          : `${data.auditRetentionDays}`
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
      void loadAudit(appliedFilters)
      void loadRetention()
    }
  }, [user, loadAudit, loadRetention, appliedFilters])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const isAdmin = selectedProject?.role === 'ADMIN'
  const retentionDirty = retentionValue !== retentionInitial
  const actionOptions = allActions
  const resourceTypeOptions = allResourceTypes

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
            <ShortcutHint keys="b" />
          </Button>
        }
      />

      {(projectsError || auditError) && (
        <ErrorBanner message={projectsError || auditError} />
      )}

      <SectionCard>
        <SectionHeader kicker="Retention" title="Retention policy" />
        {retentionError ? <ErrorBanner message={retentionError} className="mt-3" /> : null}
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
            disabled={
              !isAdmin || retentionLoading || retentionSaving || !retentionDirty
            }
            className="rounded-full px-4 py-2 text-sm"
          >
            {retentionSaving ? 'Saving...' : 'Save'}
          </Button>
          {!isAdmin ? (
            <p className="text-muted-foreground text-xs">
              Only admins can update retention settings.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader kicker="Filters" title="Audit filters" />
        {filterError ? <ErrorBanner message={filterError} className="mt-3" /> : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Action
            </label>
            <Select
              value={filters.action || 'any'}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  action: value === 'any' ? '' : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any action</SelectItem>
                {actionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Resource type
            </label>
            <Select
              value={filters.resourceType || 'any'}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  resourceType: value === 'any' ? '' : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any resource</SelectItem>
                {resourceTypeOptions.map((resourceType) => (
                  <SelectItem key={resourceType} value={resourceType}>
                    {resourceType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Resource ID
            </label>
            <Input
              placeholder="Resource ID"
              value={filters.resourceId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  resourceId: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Date range
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    controlBaseClasses,
                    controlSizeClasses.md,
                    controlVariantClasses.default,
                    'items-center justify-start gap-2 text-left font-medium',
                    !filters.dateRange?.from && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {filters.dateRange?.from ? (
                    filters.dateRange.to ? (
                      <>
                        {format(filters.dateRange.from, 'LLL dd, y')} -{' '}
                        {format(filters.dateRange.to, 'LLL dd, y')}
                      </>
                    ) : (
                      format(filters.dateRange.from, 'LLL dd, y')
                    )
                  ) : (
                    'Pick a date range'
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={filters.dateRange?.from}
                  selected={filters.dateRange}
                  onSelect={(range) =>
                    setFilters((prev) => ({ ...prev, dateRange: range }))
                  }
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Actor type
            </label>
            <Select
              value={filters.actorType}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, actorType: value }))
              }
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
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
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
          <div className="flex items-end gap-2 lg:col-span-3">
            <Button
              onClick={handleApplyFilters}
              className="rounded-full px-4 py-2 text-sm"
            >
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
        <div className="border-border/60 mt-6 border-t pt-6">
          <AuditLog
            audits={auditLogs}
            loading={auditLoading}
            error={auditError}
            withCard={false}
          />
        </div>
      </SectionCard>
    </section>
  )
}
