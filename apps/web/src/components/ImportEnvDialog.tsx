import type { EnvironmentDto, SecretDto } from '@secrets/shared'
import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { parseDotenv, type DotenvEntry, type DotenvInvalidLine } from '../lib/parseDotenv'
import { ImportDropzone } from './import/ImportDropzone'
import { ImportPreviewList } from './import/ImportPreviewList'
import { ImportSummaryBanner } from './import/ImportSummaryBanner'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Textarea } from './ui/textarea'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const ImportEnvDialog = ({
  open,
  onOpenChange,
  environment,
  secretByKey,
  valuesLoaded,
  loadSecrets,
  loadSecretCoverage,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: EnvironmentDto | null
  secretByKey: Map<string, SecretDto>
  valuesLoaded: boolean
  loadSecrets: (include: boolean) => Promise<boolean>
  loadSecretCoverage: () => Promise<void>
  children: ReactNode
}) => {
  const [importFileName, setImportFileName] = useState('')
  const [importText, setImportText] = useState('')
  const [importEntries, setImportEntries] = useState<DotenvEntry[]>([])
  const [importInvalidLines, setImportInvalidLines] = useState<
    DotenvInvalidLine[]
  >([])
  const [importDuplicateKeys, setImportDuplicateKeys] = useState<string[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const [importPreviewed, setImportPreviewed] = useState(false)
  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    skipped: number
  } | null>(null)

  useEffect(() => {
    if (!open) {
      setImportFileName('')
      setImportText('')
      setImportEntries([])
      setImportInvalidLines([])
      setImportDuplicateKeys([])
      setImportError(null)
      setImporting(false)
      setImportOverwrite(false)
      setImportPreviewed(false)
      setImportSummary(null)
    }
  }, [open])

  const importConflicts = useMemo(
    () => importEntries.filter((entry) => secretByKey.has(entry.key)),
    [importEntries, secretByKey],
  )

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportError(null)
    setImportSummary(null)
    setImportFileName(file.name)
    try {
      const content = await file.text()
      setImportText(content)
      setImportEntries([])
      setImportInvalidLines([])
      setImportDuplicateKeys([])
      setImportPreviewed(false)
    } catch (error) {
      setImportError(getErrorMessage(error))
    }
  }

  const handleImportDrop = async (file: File) => {
    setImportError(null)
    setImportSummary(null)
    setImportFileName(file.name)
    try {
      const content = await file.text()
      setImportText(content)
      setImportEntries([])
      setImportInvalidLines([])
      setImportDuplicateKeys([])
      setImportPreviewed(false)
    } catch (error) {
      setImportError(getErrorMessage(error))
    }
  }

  const handlePreviewImport = () => {
    const content = importText.trim()
    if (!content) {
      setImportError('Paste secrets or drop a file to preview.')
      return
    }
    const parsed = parseDotenv(content)
    setImportEntries(parsed.entries)
    setImportInvalidLines(parsed.invalidLines)
    setImportDuplicateKeys(parsed.duplicateKeys)
    setImportPreviewed(true)
    if (parsed.entries.length === 0) {
      setImportError('No valid environment variables found in this input.')
    }
  }

  const handleImportEnv = async () => {
    if (!environment || importing || importEntries.length === 0) return
    setImporting(true)
    setImportError(null)
    let created = 0
    let updated = 0
    let skipped = 0

    try {
      for (const entry of importEntries) {
        const existing = secretByKey.get(entry.key)
        if (existing) {
          if (!importOverwrite) {
            skipped += 1
            continue
          }
          await api.updateSecret(existing.id, { value: entry.value })
          updated += 1
          continue
        }
        await api.createSecret(environment.id, {
          key: entry.key,
          value: entry.value,
        })
        created += 1
      }

      setImportSummary({ created, updated, skipped })
      await loadSecrets(valuesLoaded)
      await loadSecretCoverage()
    } catch (error) {
      setImportError(getErrorMessage(error))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="border-border/70 bg-popover text-popover-foreground max-w-2xl rounded-3xl">
        <DialogHeader className="text-left">
          <DialogTitle>Import secrets</DialogTitle>
          <DialogDescription>
            Drop, select, or paste your .env here to import secrets into your
            environment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2 text-sm">
            <Textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value)
                setImportPreviewed(false)
              }}
              placeholder={
                '# Paste your .env here\n# Comments before a key-value pair will be parsed\nFOO=BAR\n\nAPI_BASE_URL=https://api.myapp.com # Inline comments will also be parsed\n\nHEALTH_CHECK_URL=${API_BASE_URL} # You can also reference secrets'
              }
              rows={8}
              className="border-border bg-card/70 text-foreground focus:border-foreground/60 min-h-45 w-full resize-none rounded-2xl border px-4 py-3 font-mono text-xs shadow-inner transition outline-none"
            />
            <ImportDropzone
              fileName={importFileName}
              onFileSelected={(file) => void handleImportDrop(file)}
            />
          </div>

          {importPreviewed && importEntries.length > 0 ? (
            <ImportPreviewList
              entries={importEntries}
              conflictKeys={new Set(importConflicts.map((entry) => entry.key))}
              duplicateKeys={importDuplicateKeys}
              invalidLines={importInvalidLines}
            />
          ) : null}

          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={importOverwrite}
              onCheckedChange={(value) => setImportOverwrite(Boolean(value))}
            />
            <span>Overwrite existing keys in this environment</span>
          </label>

          {importError ? (
            <p className="text-sm text-rose-600">{importError}</p>
          ) : null}

          {importSummary ? (
            <ImportSummaryBanner
              created={importSummary.created}
              updated={importSummary.updated}
              skipped={importSummary.skipped}
            />
          ) : null}
        </div>
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full px-4 text-sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            className="rounded-full bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={importPreviewed ? handleImportEnv : handlePreviewImport}
            disabled={
              importing ||
              !environment ||
              (!importPreviewed && importText.trim().length === 0) ||
              (importPreviewed && importEntries.length === 0)
            }
          >
            {importing
              ? 'Importing...'
              : importPreviewed
                ? 'Import secrets'
                : 'Preview import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
