import type { EnvironmentDto } from '@secrets/shared'
import { useMemo, useState } from 'react'
import { MissingKeysCard } from './MissingKeysCard'
import { MissingKeysDialog } from './MissingKeysDialog'

export const MissingKeysSection = ({
  coverageLoading,
  missingKeys,
  missingKeysByEnvironment,
  environments,
  environmentId,
  onCopyMissing,
}: {
  coverageLoading: boolean
  missingKeys: string[]
  missingKeysByEnvironment: Record<string, string[]>
  environments: EnvironmentDto[]
  environmentId: string
  onCopyMissing: (
    sourceEnvironmentId: string,
    keys: string[],
  ) => Promise<
    | { created: string[]; updated: string[]; skipped: string[] }
    | {
        status: 'pending'
        approvalRequestId?: string
        approvalRequestIds?: string[]
      }
  >
}) => {
  const [missingDialogOpen, setMissingDialogOpen] = useState(false)
  const [missingSourceEnvId, setMissingSourceEnvId] = useState<string | null>(
    null,
  )
  const [missingCopying, setMissingCopying] = useState(false)
  const [selectedMissingKeys, setSelectedMissingKeys] = useState<string[]>([])

  const closeMissingDialog = () => {
    setMissingDialogOpen(false)
    setMissingSourceEnvId(null)
    setMissingCopying(false)
    setSelectedMissingKeys([])
  }

  const missingSources = useMemo(() => {
    return environments
      .filter((env) => env.id !== environmentId)
      .map((env) => {
        const keys = missingKeysByEnvironment[env.id] ?? []
        return { env, count: keys.length }
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [environmentId, environments, missingKeysByEnvironment])

  const activeMissingKeys = missingSourceEnvId
    ? (missingKeysByEnvironment[missingSourceEnvId] ?? [])
    : []

  const handleMissingCopy = async () => {
    if (!missingSourceEnvId || missingCopying) return
    if (selectedMissingKeys.length === 0) return
    setMissingCopying(true)
    try {
      await onCopyMissing(missingSourceEnvId, selectedMissingKeys)
      closeMissingDialog()
    } finally {
      setMissingCopying(false)
    }
  }

  return (
    <>
      <MissingKeysCard
        loading={coverageLoading}
        missingKeys={missingKeys}
        missingSourcesCount={missingSources.length}
        onOpenDialog={() => {
          setMissingDialogOpen(true)
          const first = missingSources[0]?.env.id ?? null
          setMissingSourceEnvId(first)
          setSelectedMissingKeys(
            first ? (missingKeysByEnvironment[first] ?? []) : [],
          )
        }}
      />

      <MissingKeysDialog
        open={missingDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeMissingDialog()
        }}
        missingSources={missingSources}
        missingSourceEnvId={missingSourceEnvId}
        onSelectSource={(envId) => {
          setMissingSourceEnvId(envId)
          setSelectedMissingKeys(missingKeysByEnvironment[envId] ?? [])
        }}
        activeMissingKeys={activeMissingKeys}
        selectedMissingKeys={selectedMissingKeys}
        setSelectedMissingKeys={setSelectedMissingKeys}
        onConfirm={handleMissingCopy}
        missingCopying={missingCopying}
      />
    </>
  )
}
