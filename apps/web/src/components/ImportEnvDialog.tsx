import type { EnvironmentDto, SecretDto } from '@secrets/shared'
import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
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

const parseDotenv = (content: string) => {
  const entries = new Map<
    string,
    { key: string; value: string; line: number }
  >()
  const invalidLines: { line: number; text: string }[] = []
  const duplicateKeys = new Set<string>()
  const lines = content.split(/\r?\n/)

  const normalizeValue = (value: string) => {
    if (value.startsWith('"') && value.endsWith('"')) {
      const inner = value.slice(1, -1)
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1)
    }
    const commentIndex = value.search(/\s+#/)
    if (commentIndex >= 0) {
      return value.slice(0, commentIndex).trimEnd()
    }
    return value
  }

  lines.forEach((raw, index) => {
    let line = raw.trim()
    if (!line || line.startsWith('#')) return
    if (line.startsWith('export ')) {
      line = line.slice(7).trim()
    }
    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0) {
      invalidLines.push({ line: index + 1, text: raw })
      return
    }
    const key = line.slice(0, equalsIndex).trim()
    const rawValue = line.slice(equalsIndex + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      invalidLines.push({ line: index + 1, text: raw })
      return
    }
    if (entries.has(key)) {
      duplicateKeys.add(key)
    }
    entries.set(key, { key, value: normalizeValue(rawValue), line: index + 1 })
  })

  return {
    entries: Array.from(entries.values()),
    invalidLines,
    duplicateKeys: Array.from(duplicateKeys.values()),
  }
}

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
  const [importEntries, setImportEntries] = useState<
    { key: string; value: string; line: number }[]
  >([])
  const [importInvalidLines, setImportInvalidLines] = useState<
    { line: number; text: string }[]
  >([])
  const [importDuplicateKeys, setImportDuplicateKeys] = useState<string[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const [importDragging, setImportDragging] = useState(false)
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
      setImportDragging(false)
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
            <div
              className={`bg-secondary relative flex items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-xs transition ${
                importDragging
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-border text-muted-foreground'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setImportDragging(true)
              }}
              onDragLeave={() => setImportDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setImportDragging(false)
                const file = event.dataTransfer.files?.[0]
                if (file) {
                  void handleImportDrop(file)
                }
              }}
            >
              <input
                type="file"
                accept=".env,.env.*"
                onChange={handleImportFile}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <div className="grid gap-2 text-center">
                <span className="text-foreground/90 text-base font-semibold tracking-normal normal-case">
                  Choose a file or drag it here
                </span>
                <span className="text-muted-foreground text-xs">
                  {importFileName || 'Drop your .env to auto-fill'}
                </span>
              </div>
            </div>
          </div>

          {importPreviewed && importEntries.length > 0 ? (
            <div className="grid gap-2">
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span className="text-foreground font-semibold">
                  {importEntries.length} keys
                </span>
                <span>·</span>
                <span>{importConflicts.length} conflicts</span>
                {importDuplicateKeys.length > 0 ? (
                  <>
                    <span>·</span>
                    <span>{importDuplicateKeys.length} duplicates</span>
                  </>
                ) : null}
                {importInvalidLines.length > 0 ? (
                  <>
                    <span>·</span>
                    <span>{importInvalidLines.length} invalid</span>
                  </>
                ) : null}
              </div>
              <div className="border-border bg-card/70 max-h-56 overflow-auto rounded-2xl border">
                <div className="grid gap-1 p-3 text-xs">
                  {importEntries.map((entry) => {
                    const hasConflict = secretByKey.has(entry.key)
                    return (
                      <div
                        key={`${entry.key}-${entry.line}`}
                        className="hover:border-border/60 flex items-center justify-between gap-3 rounded-xl border border-transparent px-2 py-1"
                      >
                        <span className="text-foreground font-semibold">
                          {entry.key}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em] uppercase ${
                            hasConflict
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {hasConflict ? 'Conflict' : 'New'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {importDuplicateKeys.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  Duplicate keys detected. The last value in the file will be
                  used.
                </p>
              ) : null}
            </div>
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
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Imported {importSummary.created} new, updated{' '}
              {importSummary.updated}, skipped {importSummary.skipped}.
            </div>
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
