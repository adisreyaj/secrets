import type { EnvironmentDto } from '@secrets/shared'
import { SectionCard } from '../../components/SectionCard'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { NewEnvironmentDialog } from './NewEnvironmentDialog'

export const EnvironmentTabsCard = ({
  environments,
  envLoading,
  environmentId,
  onSelectEnvironment,
  environmentOptions,
  onCreateEnvironment,
}: {
  environments: EnvironmentDto[]
  envLoading: boolean
  environmentId: string
  onSelectEnvironment: (envId: string) => void
  environmentOptions: { id: string; name: string }[]
  onCreateEnvironment: (payload: {
    name: string
    copyFromEnvironmentId?: string | null
  }) => Promise<boolean>
}) => {
  return (
    <SectionCard className="-mb-px rounded-b-none border-b-0 p-4">
      <p className="muted-label">Environments</p>
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
              onValueChange={onSelectEnvironment}
              className="w-full"
            >
              <div className="overflow-x-auto pb-1">
                <TabsList className="w-max">
                  {environments.map((env) => (
                    <TabsTrigger key={env.id} value={env.id} className="gap-2">
                      <span className="font-semibold">{env.name}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          )}
        </div>
        <NewEnvironmentDialog
          environmentOptions={environmentOptions}
          onCreateEnvironment={onCreateEnvironment}
        />
      </div>
    </SectionCard>
  )
}
