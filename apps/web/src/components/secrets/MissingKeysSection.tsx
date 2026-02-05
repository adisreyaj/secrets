import type { EnvironmentDto } from '@secrets/shared'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
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
    overwrite: boolean,
  ) => Promise<
    | {
        created: string[]
        updated: string[]
        skipped: string[]
        skippedDetails?: { key: string; reason: string; code: string }[]
      }
    | {
        status: 'pending'
        approvalRequestId?: string
        approvalRequestIds?: string[]
      }
    | undefined
  >
}) => {
  const [missingDialogOpen, setMissingDialogOpen] = useState(false)
  const [missingSourceEnvId, setMissingSourceEnvId] = useState<string | null>(
    null,
  )
  const [missingCopying, setMissingCopying] = useState(false)
  const [selectedMissingKeys, setSelectedMissingKeys] = useState<string[]>([])
  const [overwriteExisting, setOverwriteExisting] = useState(false)

  const closeMissingDialog = () => {
    setMissingDialogOpen(false)
    setMissingSourceEnvId(null)
    setMissingCopying(false)
    setSelectedMissingKeys([])
    setOverwriteExisting(false)
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
      const result = await onCopyMissing(
        missingSourceEnvId,
        selectedMissingKeys,
        overwriteExisting,
      )
      if (result && 'status' in result && result.status === 'pending') {
        toast.info('Copy submitted for approval.')
      } else if (result && 'created' in result) {
        const created = result.created.length
        const updated = result.updated.length
        const skipped = result.skipped.length
        if (created + updated > 0) {
          toast.success(
            `Copied ${created + updated} secret${created + updated === 1 ? '' : 's'}.`,
          )
        }
        if (skipped > 0) {
          const details = result.skippedDetails ?? []
          if (details.length > 0) {
            const grouped = new Map<string, { reason: string; count: number }>()
            for (const detail of details) {
              const entry = grouped.get(detail.code)
              if (entry) {
                entry.count += 1
              } else {
                grouped.set(detail.code, { reason: detail.reason, count: 1 })
              }
            }
            const reasonSummary = Array.from(grouped.values())
              .map(
                (entry) =>
                  `${entry.count} ${entry.count === 1 ? 'item' : 'items'}: ${entry.reason}`,
              )
              .join(' · ')
            toast.warning(
              `Skipped ${skipped} secret${skipped === 1 ? '' : 's'}. ${reasonSummary}`,
            )
          } else {
            toast.warning(
              `Skipped ${skipped} secret${skipped === 1 ? '' : 's'} because the key already exists in the target environment or is pending approval.`,
            )
          }
        }
        if (created + updated + skipped === 0) {
          toast.info('No secrets were copied.')
        }
      }
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
        overwriteExisting={overwriteExisting}
        setOverwriteExisting={setOverwriteExisting}
        onConfirm={handleMissingCopy}
        missingCopying={missingCopying}
      />
    </>
  )
}
