import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DeleteEnvironmentDialog } from '../components/environment/DeleteEnvironmentDialog'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { SecretsTable } from '../components/SecretsTable'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { environmentPath, environmentsPath, projectPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'
import { toast } from 'sonner'
import { EnvironmentHeaderActions } from './environment/EnvironmentHeaderActions'
import { EnvironmentTabsCard } from './environment/EnvironmentTabsCard'
import { useEnvironmentData } from './environment/useEnvironmentData'

export const EnvironmentPage = ({
  projectId,
  environmentId,
  navigate,
}: {
  projectId: string
  environmentId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)
  const queryClient = useQueryClient()
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    projectsError,
    environments,
    envLoading,
    envError,
    secrets,
    secretsLoading,
    secretsError,
    valuesVisible,
    valuesLoaded,
    coverageLoading,
    coverageError,
    approvalsError,
    pendingBySecretId,
    missingKeys,
    missingKeysByEnvironment,
    secretByKey,
    selectedEnvironment,
    selectedProject,
    environmentOptions,
    handleToggleValues,
    handleCreateEnvironment,
    handleCreateSecret,
    handleUpdateSecrets,
    handleRollbackSecret,
    handleDeleteSecret,
    handleDiffSecret,
    handleListSecretVersions,
    handleCopySecret,
    handleCopyMissingSecrets,
    handleExportEnv,
    handleExportCsv,
    loadSecrets,
    loadSecretCoverage,
  } = useEnvironmentData({
    projectId,
    environmentId,
    enabled: Boolean(user),
  })

  const filteredSecrets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return secrets
    return secrets.filter((secret) => {
      if (secret.key.toLowerCase().includes(query)) return true
      if (valuesLoaded && secret.value?.toLowerCase().includes(query))
        return true
      return false
    })
  }, [secrets, searchQuery, valuesLoaded])

  useEffect(() => {
    const selectByIndex = (index: number) => {
      const target = environments[index]
      if (target) {
        navigate(
          environmentPath(
            projectId,
            selectedProject?.slug,
            target.id,
            target.slug,
          ),
        )
      }
    }

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.length === 1 ? event.key : ''
      if (!key) return
      if (key >= '1' && key <= '9') {
        const index = Number(key) - 1
        selectByIndex(index)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [environments, navigate, projectId])

  useRegisterShortcut('b', () =>
    navigate(environmentsPath(projectId, selectedProject?.slug)),
  )
  useRegisterShortcut('v', () => handleToggleValues(!valuesVisible))
  useRegisterShortcut('d', () => handleExportEnv())
  useRegisterShortcut('i', () => setImportDialogOpen(true))
  useRegisterShortcut('c', () => handleExportCsv())

  const isLastEnvironment = environments.length === 1

  const handleDeleteEnvironment = async ({
    confirmText,
    forceLastEnvironment,
  }: {
    confirmText: string
    forceLastEnvironment: boolean
  }) => {
    if (!selectedEnvironment || deleting) return
    setDeleteError(null)
    setDeleting(true)
    try {
      await api.deleteEnvironment(projectId, selectedEnvironment.id, {
        confirmText,
        forceLastEnvironment,
      })
      toast.success('Environment deleted.')

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.environments(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.secrets(selectedEnvironment.id, false) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.secrets(selectedEnvironment.id, true) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.approvals(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(projectId) }),
      ])
      setDeleteDialogOpen(false)

      if (isLastEnvironment) {
        navigate(projectPath(projectId, selectedProject?.slug))
      } else {
        navigate(environmentsPath(projectId, selectedProject?.slug))
      }
    } catch (error) {
      const message = getErrorMessage(error)
      setDeleteError(message)
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Secrets"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <EnvironmentHeaderActions
            importDialogOpen={importDialogOpen}
            onImportOpenChange={setImportDialogOpen}
            selectedEnvironment={selectedEnvironment}
            secretByKey={secretByKey}
            valuesLoaded={valuesLoaded}
            loadSecrets={loadSecrets}
            loadSecretCoverage={loadSecretCoverage}
            onExport={handleExportEnv}
            onExportCsv={handleExportCsv}
            onBack={() =>
              navigate(environmentsPath(projectId, selectedProject?.slug))
            }
          />
        }
      />

      {(projectsError ||
        envError ||
        secretsError ||
        coverageError ||
        approvalsError) && (
        <ErrorBanner
          message={
            (projectsError ||
              envError ||
              secretsError ||
              coverageError ||
              approvalsError) as string
          }
        />
      )}

      <section className="flex flex-col gap-0">
        <EnvironmentTabsCard
          environments={environments}
          envLoading={envLoading}
          environmentId={environmentId}
          onSelectEnvironment={(envId) =>
            navigate(
              environmentPath(
                projectId,
                selectedProject?.slug,
                envId,
                environments.find((env) => env.id === envId)?.slug,
              ),
            )
          }
          environmentOptions={environmentOptions}
          onCreateEnvironment={handleCreateEnvironment}
        />

        <SecretsTable
          secrets={filteredSecrets}
          environments={environments}
          environmentId={environmentId}
          includeValues={valuesVisible}
          loading={secretsLoading}
          coverageLoading={coverageLoading}
          error={secretsError}
          missingKeys={missingKeys}
          missingKeysByEnvironment={missingKeysByEnvironment}
          pendingBySecretId={pendingBySecretId}
          onToggleValues={handleToggleValues}
          onCreate={handleCreateSecret}
          onUpdateMany={handleUpdateSecrets}
          onRollback={handleRollbackSecret}
          onDiff={handleDiffSecret}
          onListVersions={handleListSecretVersions}
          onDelete={handleDeleteSecret}
          onCopy={handleCopySecret}
          onCopyMissing={handleCopyMissingSecrets}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          className="rounded-t-none border-t-0"
        />
      </section>

      <SectionCard className="border-destructive/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-destructive text-lg font-semibold">Danger Zone</h3>
            <p className="text-muted-foreground text-xs">
              Deleting this environment permanently removes all secrets in it.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={selectedProject?.role !== 'ADMIN' || !selectedEnvironment}
          >
            Delete environment
          </Button>
        </div>
      </SectionCard>

      {selectedEnvironment ? (
        <DeleteEnvironmentDialog
          open={deleteDialogOpen}
          environmentName={selectedEnvironment.name}
          isLastEnvironment={isLastEnvironment}
          deleting={deleting}
          error={deleteError}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteEnvironment}
        />
      ) : null}
    </section>
  )
}
