import type {
    ApprovalRequestDto,
    ApprovalStatus,
    EnvironmentDto,
    ProjectDto,
} from '@secrets/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'

export const ApprovalsPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
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
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const environments = useMemo(() => environmentsData ?? [], [environmentsData])
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>('PENDING')
  const [detailId, setDetailId] = useState<string | null>(null)

  const {
    data: approvalsData,
    isLoading: approvalsLoading,
    error: approvalsErrorRaw,
    refetch: refetchApprovals,
  } = useQuery<ApprovalRequestDto[]>({
    queryKey: queryKeys.approvals(projectId, statusFilter),
    queryFn: () => api.listApprovals(projectId, { status: statusFilter }),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const approvals = approvalsData ?? []

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery<ApprovalRequestDto>({
    queryKey: detailId ? queryKeys.approval(detailId) : ['approvals', 'detail'],
    queryFn: () => api.getApproval(detailId ?? ''),
    enabled: Boolean(detailId),
  })

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )

  const envById = useMemo(() => {
    const map = new Map<string, string>()
    for (const env of environments) {
      map.set(env.id, env.name)
    }
    return map
  }, [environments])

  const isAdmin = selectedProject?.role === 'ADMIN'

  const openDetail = async (approvalId: string) => {
    setDetailId(approvalId)
  }

  const closeDetail = () => {
    setDetailId(null)
  }

  const handleApprove = async (approvalId: string) => {
    await api.approveRequest(approvalId)
    await queryClient.invalidateQueries({
      queryKey: queryKeys.approvals(projectId, statusFilter),
    })
  }

  const handleDeny = async (approvalId: string) => {
    await api.denyRequest(approvalId)
    await queryClient.invalidateQueries({
      queryKey: queryKeys.approvals(projectId, statusFilter),
    })
  }

  const handleCancel = async (approvalId: string) => {
    await api.cancelRequest(approvalId)
    await queryClient.invalidateQueries({
      queryKey: queryKeys.approvals(projectId, statusFilter),
    })
  }

  useRegisterShortcut('b', () =>
    navigate(projectPath(projectId, selectedProject?.slug)),
  )

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Approvals"
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

      {(projectsErrorRaw || envErrorRaw || approvalsErrorRaw) && (
        <ErrorBanner
          message={getErrorMessage(
            projectsErrorRaw ?? envErrorRaw ?? approvalsErrorRaw,
          )}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px]">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as ApprovalStatus)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="DENIED">Denied</SelectItem>
              <SelectItem value="CANCELED">Canceled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => refetchApprovals()}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {approvalsLoading ? (
          <EmptyState title="Loading approvals..." />
        ) : approvals.length === 0 ? (
          <EmptyState title="No approvals for this filter." />
        ) : (
          approvals.map((approval) => (
            <div
              key={approval.id}
              className="border-border/60 bg-card/80 shadow-soft rounded-2xl border p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {approval.action} · {approval.key}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Env:{' '}
                    {envById.get(approval.environmentId) ??
                      approval.environmentId.slice(0, 6)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Requested {formatDateTime(approval.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => openDetail(approval.id)}
                  >
                    Details
                  </Button>
                  {approval.status === 'PENDING' && isAdmin ? (
                    <>
                      <Button
                        className="rounded-full"
                        onClick={() => handleApprove(approval.id)}
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
                        onClick={() => handleDeny(approval.id)}
                      >
                        <X className="h-4 w-4" />
                        Deny
                      </Button>
                    </>
                  ) : null}
                  {approval.status === 'PENDING' &&
                  approval.requestedBy === user?.id ? (
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => handleCancel(approval.id)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={Boolean(detailId)}
        onOpenChange={(open) => (!open ? closeDetail() : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approval details</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-muted-foreground text-sm">Loading details...</p>
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">Action:</span> {detail.action}
              </p>
              <p>
                <span className="font-semibold">Key:</span> {detail.key}
              </p>
              <p>
                <span className="font-semibold">Environment:</span>{' '}
                {envById.get(detail.environmentId) ?? detail.environmentId}
              </p>
              {detail.currentValue !== undefined ? (
                <div>
                  <p className="muted-label">Current value</p>
                  <pre className="bg-muted mt-2 rounded-lg p-3 text-xs whitespace-pre-wrap">
                    {detail.currentValue ?? '—'}
                  </pre>
                </div>
              ) : null}
              {detail.proposedValue !== undefined ? (
                <div>
                  <p className="muted-label">Proposed value</p>
                  <pre className="bg-muted mt-2 rounded-lg p-3 text-xs whitespace-pre-wrap">
                    {detail.proposedValue ?? '—'}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No details available.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
