import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SecretsTable } from '../components/SecretsTable'
import { environmentPath, environmentsPath } from '../lib/paths'
import { useRegisterShortcut } from '../lib/shortcuts'
import { useRequireAuth } from '../lib/useRequireAuth'
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
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
    </section>
  )
}
