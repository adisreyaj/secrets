import type { EnvironmentDto, SecretDto } from '@secrets/shared'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import {
  parseDotenv,
  type DotenvEntry,
  type DotenvInvalidLine,
} from '../lib/parseDotenv'
import { ErrorBanner } from './ErrorBanner'
import { ImportDropzone } from './import/ImportDropzone'
import { ImportPreviewList } from './import/ImportPreviewList'
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
  const [, setImportPreviewed] = useState(false)
  const [step, setStep] = useState<'input' | 'preview'>('input')

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
      setStep('input')
    }
  }, [open])

  const importConflicts = useMemo(
    () => importEntries.filter((entry) => secretByKey.has(entry.key)),
    [importEntries, secretByKey],
  )

  const handleImportDrop = async (file: File) => {
    setImportError(null)
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
    setStep('preview')
    if (parsed.entries.length === 0) {
      setImportError('No valid environment variables found in this input.')
    }
  }

  const handleImportEnv = async () => {
    if (!environment || importing || importEntries.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const deduped = new Map<string, string>()
      for (const entry of importEntries) {
        deduped.set(entry.key, entry.value)
      }
      const entries = Array.from(deduped.entries()).map(([key, value]) => ({
        key,
        value,
      }))
      const result = await api.bulkImportSecrets(environment.id, {
        entries,
        overwrite: importOverwrite,
      })
      await loadSecrets(valuesLoaded)
      await loadSecretCoverage()
      const summary = [
        `Imported ${result.created} new`,
        `updated ${result.updated}`,
        `skipped ${result.skipped}`,
      ]
      const pendingSuffix =
        result.pending > 0 ? `, pending approval ${result.pending}` : ''
      toast.success(`${summary.join(', ')}${pendingSuffix}.`)
      onOpenChange(false)
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
          {step === 'input' ? (
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
                onFileSelected={(file) => handleImportDrop(file)}
              />
            </div>
          ) : (
            <>
              <ImportPreviewList
                entries={importEntries}
                conflictKeys={
                  new Set(importConflicts.map((entry) => entry.key))
                }
                duplicateKeys={importDuplicateKeys}
                invalidLines={importInvalidLines}
              />
              {importDuplicateKeys.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  Duplicates resolve to the last value in the import list.
                </p>
              ) : null}
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={importOverwrite}
                  onCheckedChange={(value) =>
                    setImportOverwrite(Boolean(value))
                  }
                />
                <span>Overwrite existing keys in this environment</span>
              </label>
            </>
          )}

          {importError ? (
            <ErrorBanner message={importError} className="mt-3" />
          ) : null}
        </div>
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (step === 'preview') {
                setStep('input')
                setImportPreviewed(false)
                return
              }
              onOpenChange(false)
            }}
          >
            {step === 'preview' ? 'Back' : 'Close'}
          </Button>
          <Button
            type="button"
            onClick={step === 'preview' ? handleImportEnv : handlePreviewImport}
            disabled={
              importing ||
              !environment ||
              (step === 'input' && importText.trim().length === 0) ||
              (step === 'preview' && importEntries.length === 0)
            }
          >
            {importing
              ? 'Importing...'
              : step === 'preview'
                ? 'Import secrets'
                : 'Preview import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
