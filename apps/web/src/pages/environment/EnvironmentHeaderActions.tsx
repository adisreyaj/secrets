import type { EnvironmentDto, SecretDto } from '@secrets/shared'
import { ArrowLeft, FileDown, FileSpreadsheet, FileUp } from 'lucide-react'
import { ImportEnvDialog } from '../../components/ImportEnvDialog'
import { ShortcutHint } from '../../components/ShortcutHint'
import { Button } from '../../components/ui/button'

export const EnvironmentHeaderActions = ({
  importDialogOpen,
  onImportOpenChange,
  selectedEnvironment,
  secretByKey,
  valuesLoaded,
  loadSecrets,
  loadSecretCoverage,
  onExport,
  onExportCsv,
  onBack,
}: {
  importDialogOpen: boolean
  onImportOpenChange: (open: boolean) => void
  selectedEnvironment: EnvironmentDto | null
  secretByKey: Map<string, SecretDto>
  valuesLoaded: boolean
  loadSecrets: (include: boolean) => Promise<boolean>
  loadSecretCoverage: () => Promise<void>
  onExport: () => void
  onExportCsv: () => void
  onBack: () => void
}) => {
  return (
    <>
      <ImportEnvDialog
        open={importDialogOpen}
        onOpenChange={onImportOpenChange}
        environment={selectedEnvironment}
        secretByKey={secretByKey}
        valuesLoaded={valuesLoaded}
        loadSecrets={loadSecrets}
        loadSecretCoverage={loadSecretCoverage}
      >
        <Button
          variant="outline"
          className="border-border bg-muted/40 text-foreground hover:bg-muted flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
          disabled={!selectedEnvironment}
        >
          <FileUp className="h-4 w-4" />
          Import .env
          <ShortcutHint keys="i" />
        </Button>
      </ImportEnvDialog>
      <Button
        variant="outline"
        className="border-border bg-muted/40 text-foreground hover:bg-muted flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
        onClick={onExport}
        disabled={!selectedEnvironment}
      >
        <FileDown className="h-4 w-4" />
        Download .env
        <ShortcutHint keys="d" />
      </Button>
      <Button
        variant="outline"
        className="border-border bg-muted/40 text-foreground hover:bg-muted flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
        onClick={onExportCsv}
        disabled={!selectedEnvironment}
      >
        <FileSpreadsheet className="h-4 w-4" />
        Download CSV
        <ShortcutHint keys="c" />
      </Button>
      <Button
        variant="outline"
        className="border-border text-foreground hover:border-foreground/40 flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to environments
        <ShortcutHint keys="b" />
      </Button>
    </>
  )
}
