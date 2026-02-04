import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApprovalRequestDto, ApprovalStatus, EnvironmentDto, ProjectDto } from '@secrets/shared'
import { ArrowLeft, Check, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRegisterShortcut } from '../lib/shortcuts'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ApprovalsPage = ({
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
  const [approvals, setApprovals] = useState<ApprovalRequestDto[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalsError, setApprovalsError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>('PENDING')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApprovalRequestDto | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true)
    setApprovalsError(null)
    try {
      const data = await api.listApprovals(projectId, { status: statusFilter })
      setApprovals(data)
    } catch (error) {
      setApprovalsError(getErrorMessage(error))
    } finally {
      setApprovalsLoading(false)
    }
  }, [projectId, statusFilter])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
      void loadApprovals()
    }
  }, [user, loadProjects, loadEnvironments, loadApprovals])

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
    setDetailLoading(true)
    try {
      const data = await api.getApproval(approvalId)
      setDetail(data)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailId(null)
    setDetail(null)
  }

  const handleApprove = async (approvalId: string) => {
    await api.approveRequest(approvalId)
    await loadApprovals()
  }

  const handleDeny = async (approvalId: string) => {
    await api.denyRequest(approvalId)
    await loadApprovals()
  }

  const handleCancel = async (approvalId: string) => {
    await api.cancelRequest(approvalId)
    await loadApprovals()
  }

  useRegisterShortcut('b', () => navigate(`/projects/${projectId}`))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Approvals"
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

      {(projectsError || envError || approvalsError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError || approvalsError}
        </div>
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
          onClick={() => loadApprovals()}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {approvalsLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
            Loading approvals...
          </div>
        ) : approvals.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
            No approvals for this filter.
          </div>
        ) : (
          approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {approval.action} · {approval.key}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Env: {envById.get(approval.environmentId) ?? approval.environmentId.slice(0, 6)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested {new Date(approval.createdAt).toLocaleString()}
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
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
                        onClick={() => handleDeny(approval.id)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Deny
                      </Button>
                    </>
                  ) : null}
                  {approval.status === 'PENDING' && approval.requestedBy === user?.id ? (
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

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => (!open ? closeDetail() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approval details</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Loading details...</p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Current value
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                    {detail.currentValue ?? '—'}
                  </pre>
                </div>
              ) : null}
              {detail.proposedValue !== undefined ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Proposed value
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                    {detail.proposedValue ?? '—'}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No details available.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
