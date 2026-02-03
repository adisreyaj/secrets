import type { EnvironmentDto, ProjectDto, SecretDto } from '@secrets/shared'
import { ArrowLeft, FileDown, FileUp } from 'lucide-react'
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { PageHeader } from '../components/PageHeader'
import { SecretsTable } from '../components/SecretsTable'
import { SectionCard } from '../components/SectionCard'
import { ShortcutHint } from '../components/ShortcutHint'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRegisterShortcut } from '../lib/shortcuts'

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

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

export const EnvironmentPage = ({
  projectId,
  environmentId,
  navigate,
}: {
  projectId: string
  environmentId: string
  navigate: (path: string) => void
}) => {
  const { user, loading } = useAuth()

  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)

  const [secrets, setSecrets] = useState<SecretDto[]>([])
  const [secretsLoading, setSecretsLoading] = useState(false)
  const [secretsError, setSecretsError] = useState<string | null>(null)
  const [valuesVisible, setValuesVisible] = useState(false)
  const [valuesLoaded, setValuesLoaded] = useState(false)
  const [secretKeyIndex, setSecretKeyIndex] = useState<
    Record<string, string[]>
  >({})
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copyFromId, setCopyFromId] = useState<string>('none')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
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
    setEnvLoading(true)
    setEnvError(null)
    try {
      const data = await api.listEnvironments(projectId)
      setEnvironments(data)
    } catch (error) {
      setEnvError(getErrorMessage(error))
    } finally {
      setEnvLoading(false)
    }
  }, [projectId])

  const loadSecrets = useCallback(
    async (include: boolean) => {
      setSecretsLoading(true)
      setSecretsError(null)
      try {
        const data = await api.listSecrets(environmentId, include)
        setSecrets(data)
        return true
      } catch (error) {
        setSecretsError(getErrorMessage(error))
        return false
      } finally {
        setSecretsLoading(false)
      }
    },
    [environmentId],
  )

  const loadSecretCoverage = useCallback(async () => {
    if (environments.length === 0) {
      setSecretKeyIndex({})
      return
    }

    setCoverageLoading(true)
    setCoverageError(null)
    try {
      const entries = await Promise.all(
        environments.map(async (env) => {
          const data = await api.listSecrets(env.id, false)
          return [env.id, data.map((secret) => secret.key)] as const
        }),
      )
      const next: Record<string, string[]> = {}
      for (const [envId, keys] of entries) {
        next[envId] = keys
      }
      setSecretKeyIndex(next)
    } catch (error) {
      setCoverageError(getErrorMessage(error))
    } finally {
      setCoverageLoading(false)
    }
  }, [environments])

  useEffect(() => {
    if (user) {
      void loadProjects()
      void loadEnvironments()
    }
  }, [user, loadProjects, loadEnvironments])

  useEffect(() => {
    if (user) {
      void loadSecrets(valuesLoaded)
    }
  }, [user, valuesLoaded, loadSecrets])

  useEffect(() => {
    if (user && environments.length > 0) {
      void loadSecretCoverage()
    }
  }, [user, environments, loadSecretCoverage])

  useEffect(() => {
    if (!dialogOpen) {
      setName('')
      setCopyFromId('none')
    }
  }, [dialogOpen])

  useEffect(() => {
    if (!importDialogOpen) {
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
  }, [importDialogOpen])

  const allSecretKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const list of Object.values(secretKeyIndex)) {
      for (const key of list) {
        keys.add(key)
      }
    }
    return keys
  }, [secretKeyIndex])

  const missingKeys = useMemo(() => {
    const currentKeys = new Set(secretKeyIndex[environmentId] ?? [])
    const missing: string[] = []
    for (const key of allSecretKeys) {
      if (!currentKeys.has(key)) {
        missing.push(key)
      }
    }
    missing.sort((a, b) => a.localeCompare(b))
    return missing
  }, [allSecretKeys, environmentId, secretKeyIndex])

  const missingKeysByEnvironment = useMemo(() => {
    const currentKeys = new Set(secretKeyIndex[environmentId] ?? [])
    const map: Record<string, string[]> = {}
    for (const env of environments) {
      if (env.id === environmentId) continue
      const keys = secretKeyIndex[env.id] ?? []
      const candidates = keys.filter((key) => !currentKeys.has(key))
      if (candidates.length > 0) {
        map[env.id] = candidates.sort((a, b) => a.localeCompare(b))
      }
    }
    return map
  }, [environmentId, environments, secretKeyIndex])

  const secretByKey = useMemo(() => {
    const map = new Map<string, SecretDto>()
    for (const secret of secrets) {
      map.set(secret.key, secret)
    }
    return map
  }, [secrets])

  const importConflicts = useMemo(
    () => importEntries.filter((entry) => secretByKey.has(entry.key)),
    [importEntries, secretByKey],
  )

  const handleToggleValues = async (nextVisible: boolean) => {
    if (nextVisible && !valuesLoaded) {
      const loaded = await loadSecrets(true)
      if (loaded) {
        setValuesLoaded(true)
      }
    }
    setValuesVisible(nextVisible)
  }

  const handleCreateEnvironment = async (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => {
    await api.createEnvironment(projectId, payload)
    await loadEnvironments()
  }

  const handleCreateSecret = async (payload: {
    key: string
    value: string
  }) => {
    await api.createSecret(environmentId, payload)
    await loadSecrets(valuesLoaded)
  }

  const handleUpdateSecrets = async (
    changes: { id: string; key?: string; value?: string }[],
  ) => {
    let keyUpdated = false
    for (const change of changes) {
      if (change.key !== undefined) {
        keyUpdated = true
      }
      await api.updateSecret(change.id, {
        key: change.key,
        value: change.value,
      })
    }
    await loadSecrets(valuesLoaded)
    if (keyUpdated) {
      await loadSecretCoverage()
    }
  }

  const handleRollbackSecret = async (secretId: string) => {
    await api.rollbackSecret(secretId)
    await loadSecrets(valuesLoaded)
  }

  const handleDeleteSecret = async (secretId: string) => {
    await api.deleteSecret(secretId)
    await loadSecrets(valuesLoaded)
  }

  const handleCopySecret = async (
    secretId: string,
    payload: { targetEnvironmentIds: string[]; overwrite: boolean },
  ) => {
    const result = await api.copySecret(secretId, payload)
    await loadSecretCoverage()
    return result
  }

  const handleCopyMissingSecrets = async (
    sourceEnvironmentId: string,
    keys: string[],
  ) => {
    const result = await api.copySecretsFromEnvironment(environmentId, {
      sourceEnvironmentId,
      keys,
      overwrite: false,
    })
    await loadSecretCoverage()
    await loadSecrets(valuesLoaded)
    return result
  }

  const selectedEnvironment =
    environments.find((env) => env.id === environmentId) ?? null
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null
  const environmentOptions = useMemo(
    () => environments.map((env) => ({ id: env.id, name: env.name })),
    [environments],
  )

  useEffect(() => {
    const selectByIndex = (index: number) => {
      const target = environments[index]
      if (target) {
        navigate(`/projects/${projectId}/environments/${target.id}`)
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

  const handleCreateEnvironmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      await handleCreateEnvironment({
        name: trimmedName,
        copyFromEnvironmentId: copyFromId !== 'none' ? copyFromId : undefined,
      })
      setDialogOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const handleExportEnv = async () => {
    if (!selectedEnvironment) return
    const content = await api.exportEnv(selectedEnvironment.id)
    const projectSlug =
      toSlug(selectedProject?.name ?? projectId.slice(0, 6)) ||
      projectId.slice(0, 6)
    const environmentSlug =
      toSlug(selectedEnvironment.name) || selectedEnvironment.id.slice(0, 6)
    const filename = `${projectSlug}-${environmentSlug}.env`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

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
    if (!selectedEnvironment || importing || importEntries.length === 0) return
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
        await api.createSecret(selectedEnvironment.id, {
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

  useRegisterShortcut('b', () =>
    navigate(`/projects/${projectId}/environments`),
  )
  useRegisterShortcut('v', () => handleToggleValues(!valuesVisible))
  useRegisterShortcut('d', () => handleExportEnv())
  useRegisterShortcut('i', () => setImportDialogOpen(true))
  useRegisterShortcut('shift+n', () => setDialogOpen(true))

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Secrets"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <>
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border bg-muted/40 text-foreground hover:bg-muted flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                  disabled={!selectedEnvironment}
                >
                  <FileUp className="h-4 w-4" />
                  Import .env
                  <ShortcutHint keys="i" />
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border/70 bg-popover text-popover-foreground max-w-2xl rounded-3xl">
                <DialogHeader className="text-left">
                  <DialogTitle>Import secrets</DialogTitle>
                  <DialogDescription>
                    Drop, select, or paste your .env here to import secrets into
                    your environment.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2 text-sm">
                    <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                      Import source
                    </span>
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
                          Duplicate keys detected. The last value in the file
                          will be used.
                        </p>
                      ) : null}
                    </div>
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
                    onClick={() => setImportDialogOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={
                      importPreviewed ? handleImportEnv : handlePreviewImport
                    }
                    disabled={
                      importing ||
                      !selectedEnvironment ||
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
            <Button
              variant="outline"
              className="border-border bg-muted/40 text-foreground hover:bg-muted flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
              onClick={handleExportEnv}
              disabled={!selectedEnvironment}
            >
              <FileDown className="h-4 w-4" />
              Download .env
              <ShortcutHint keys="d" />
            </Button>
            <Button
              variant="outline"
              className="border-border text-foreground hover:border-foreground/40 flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
              onClick={() => navigate(`/projects/${projectId}/environments`)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to environments
              <ShortcutHint keys="b" />
            </Button>
          </>
        }
      />

      {(projectsError || envError || secretsError || coverageError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {projectsError || envError || secretsError || coverageError}
        </div>
      )}

      <section className="flex flex-col gap-0">
        <SectionCard className="-mb-px rounded-b-none border-b-0 p-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
            Environments
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              {envLoading ? (
                <div className="border-border bg-card/70 text-muted-foreground rounded-full border border-dashed px-4 py-2 text-sm">
                  Loading environments...
                </div>
              ) : environments.length === 0 ? (
                <div className="border-border bg-card/70 text-muted-foreground rounded-full border border-dashed px-4 py-2 text-sm">
                  Create your first environment.
                </div>
              ) : (
                <Tabs
                  value={environmentId}
                  onValueChange={(envId) =>
                    navigate(`/projects/${projectId}/environments/${envId}`)
                  }
                  className="w-full"
                >
                  <div className="overflow-x-auto pb-1">
                    <TabsList className="w-max">
                      {environments.map((env) => (
                        <TabsTrigger
                          key={env.id}
                          value={env.id}
                          className="gap-2"
                        >
                          <span className="font-semibold">{env.name}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                </Tabs>
              )}
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border text-foreground hover:border-foreground/40 flex items-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  New environment
                  <ShortcutHint keys="Shift+n" />
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border/70 bg-popover text-popover-foreground rounded-3xl">
                <DialogHeader className="text-left">
                  <DialogTitle>Create environment</DialogTitle>
                  <DialogDescription>
                    Spin up a new environment and optionally duplicate keys from
                    an existing one.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={handleCreateEnvironmentSubmit}
                  className="grid gap-4"
                >
                  <label className="grid gap-2 text-sm">
                    <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                      Environment name
                    </span>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. staging"
                      className="bg-background h-11 rounded-2xl px-4"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                      Copy keys from
                    </span>
                    <Select
                      value={copyFromId}
                      onValueChange={setCopyFromId}
                      disabled={environmentOptions.length === 0}
                    >
                      <SelectTrigger className="h-11 px-4">
                        <SelectValue placeholder="Don't copy anything" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Don&apos;t copy anything
                        </SelectItem>
                        {environmentOptions.map((env) => (
                          <SelectItem key={env.id} value={env.id}>
                            {env.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-xs">
                      Copies keys (and current values) into the new environment.
                    </span>
                  </label>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-full px-4 text-sm"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-6 text-sm font-semibold"
                      disabled={creating || !name.trim()}
                    >
                      {creating ? 'Creating...' : 'Create environment'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </SectionCard>

        <SecretsTable
          secrets={secrets}
          environments={environments}
          environmentId={environmentId}
          includeValues={valuesVisible}
          loading={secretsLoading}
          coverageLoading={coverageLoading}
          error={secretsError}
          missingKeys={missingKeys}
          missingKeysByEnvironment={missingKeysByEnvironment}
          onToggleValues={handleToggleValues}
          onCreate={handleCreateSecret}
          onUpdateMany={handleUpdateSecrets}
          onRollback={handleRollbackSecret}
          onDelete={handleDeleteSecret}
          onCopy={handleCopySecret}
          onCopyMissing={handleCopyMissingSecrets}
          className="rounded-t-none border-t-0"
        />
      </section>
    </section>
  )
}
