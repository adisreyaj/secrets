import type { AuditLogDto, AuditLogFilters, ProjectDto } from '@secrets/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfDay, startOfDay } from 'date-fns'
import { ArrowLeft, CalendarIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
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
import { queryKeys } from '../lib/queryKeys'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'
import { cn } from '../lib/utils'

type AuditActorType = 'user' | 'service'

type AuditFilterState = {
  action: string
  resourceType: string
  resourceId: string
  actorType: AuditActorType
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
  const queryClient = useQueryClient()

  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>(
    {
      queryKey: queryKeys.projects(),
      queryFn: () => api.listProjects(),
      enabled: Boolean(user),
    },
  )
  const projects = useMemo(() => projectsData ?? [], [projectsData])

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

  const filtersKey = useMemo(
    () => (appliedFilters ? JSON.stringify(appliedFilters) : 'all'),
    [appliedFilters],
  )

  const {
    data: auditLogsData,
    isLoading: auditLoading,
    error: auditErrorRaw,
    refetch: refetchAudit,
  } = useQuery<AuditLogDto[]>({
    queryKey: queryKeys.audit(projectId, filtersKey),
    queryFn: () => api.listAudit(projectId, appliedFilters),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const auditLogs = auditLogsData ?? []

  const actionOptions = useMemo(() => {
    if (appliedFilters) return []
    return Array.from(
      new Set(auditLogs.map((log) => log.action).filter(Boolean)),
    ).sort()
  }, [appliedFilters, auditLogs])

  const resourceTypeOptions = useMemo(() => {
    if (appliedFilters) return []
    return Array.from(
      new Set(auditLogs.map((log) => log.resourceType).filter(Boolean)),
    ).sort()
  }, [appliedFilters, auditLogs])

  const {
    data: retentionData,
    isLoading: retentionLoading,
    error: retentionErrorRaw,
  } = useQuery({
    queryKey: ['projects', projectId, 'audit-retention'],
    queryFn: () => api.getAuditRetention(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const retentionInitial = useMemo(() => {
    if (!retentionData) return '90'
    return retentionData.auditRetentionDays === null
      ? 'forever'
      : `${retentionData.auditRetentionDays}`
  }, [retentionData])

  const [retentionValue, setRetentionValue] = useState('90')
  const [retentionSaving, setRetentionSaving] = useState(false)
  const retentionDirty = retentionValue !== retentionInitial

  useEffect(() => {
    setRetentionValue(retentionInitial)
  }, [retentionInitial])

  const updateRetentionMutation = useMutation({
    mutationFn: async (value: string) => {
      const auditRetentionDays = value === 'forever' ? null : Number(value)
      return api.updateAuditRetention(projectId, { auditRetentionDays })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'audit-retention'],
      })
    },
  })

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
    void refetchAudit()
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
    void refetchAudit()
  }

  const handleSaveRetention = async () => {
    if (retentionSaving) return
    setRetentionSaving(true)
    try {
      await updateRetentionMutation.mutateAsync(retentionValue)
    } catch {
      // error handled via mutation state
    } finally {
      setRetentionSaving(false)
    }
  }

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const isAdmin = selectedProject?.role === 'ADMIN'

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  const auditError = auditErrorRaw ? getErrorMessage(auditErrorRaw) : null
  const projectsError = projectsErrorRaw
    ? getErrorMessage(projectsErrorRaw)
    : null
  const retentionError = retentionErrorRaw
    ? getErrorMessage(retentionErrorRaw)
    : null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
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

      {(projectsError || auditError || filterError || retentionError) && (
        <ErrorBanner
          message={projectsError || auditError || filterError || retentionError}
        />
      )}

      <SectionCard>
        <SectionHeader
          kicker="Audit"
          title="Audit log"
          action={
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => refetchAudit()}
            >
              Refresh
            </Button>
          }
        />

        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <p className="muted-label">Date range</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      controlBaseClasses,
                      controlSizeClasses.md,
                      controlVariantClasses.outline,
                      'justify-between text-left font-normal',
                    )}
                  >
                    {filters.dateRange?.from ? (
                      filters.dateRange.to ? (
                        `${filters.dateRange.from.toLocaleDateString()} - ${filters.dateRange.to.toLocaleDateString()}`
                      ) : (
                        filters.dateRange.from.toLocaleDateString()
                      )
                    ) : (
                      <span className="text-muted-foreground">Pick dates</span>
                    )}
                    <CalendarIcon className="h-4 w-4 opacity-60" />
                  </Button>
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

            <div className="grid gap-2">
              <p className="muted-label">Action</p>
              <Select
                value={filters.action}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, action: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {actionOptions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <p className="muted-label">Resource type</p>
              <Select
                value={filters.resourceType}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, resourceType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {resourceTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <p className="muted-label">Resource ID</p>
              <Input
                value={filters.resourceId}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    resourceId: event.target.value,
                  }))
                }
                placeholder="Optional ID"
              />
            </div>

            <div className="grid gap-2">
              <p className="muted-label">Actor type</p>
              <Select
                value={filters.actorType}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    actorType: value as AuditActorType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Actor type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="service">Service account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <p className="muted-label">Actor ID</p>
              <Input
                value={filters.actorId}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    actorId: event.target.value,
                  }))
                }
                placeholder="Optional ID"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={handleApplyFilters}
            >
              Apply filters
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={handleClearFilters}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          kicker="Log"
          title="Latest events"
          action={
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => refetchAudit()}
            >
              Refresh
            </Button>
          }
        />
        <div className="mt-4">
          {auditLoading ? (
            <p className="text-muted-foreground text-sm">
              Loading audit log...
            </p>
          ) : auditLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No audit events yet.
            </p>
          ) : (
            <AuditLog logs={auditLogs} />
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          kicker="Retention"
          title="Retention settings"
          action={
            <Button
              variant="outline"
              className="rounded-full"
              onClick={handleSaveRetention}
              disabled={!retentionDirty || retentionSaving || !isAdmin}
            >
              Save retention
            </Button>
          }
        />
        <div className="mt-4 grid gap-3">
          <p className="text-muted-foreground text-sm">
            Configure how long audit data should be retained.
          </p>
          <Select
            value={retentionValue}
            onValueChange={(value) => setRetentionValue(value)}
            disabled={retentionLoading || !isAdmin}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select retention" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="180">180 days</SelectItem>
              <SelectItem value="365">365 days</SelectItem>
              <SelectItem value="forever">Forever</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>
    </section>
  )
}
