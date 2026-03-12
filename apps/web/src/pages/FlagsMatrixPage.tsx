import type { EnvironmentDto, FeatureFlagMatrixRowDto, ProjectDto } from '@secrets/shared'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { flagEnvironmentsPath } from '../lib/paths'
import { queryKeys } from '../lib/queryKeys'
import { asArray } from '../lib/queryResult'
import { useRequireAuth } from '../lib/useRequireAuth'

export const FlagsMatrixPage = ({
  projectId,
  navigate,
}: {
  projectId: string
  navigate: (path: string) => void
}) => {
  const { user } = useRequireAuth(navigate)

  const { data: projectsData, error: projectsErrorRaw } = useQuery<ProjectDto[]>({
    queryKey: queryKeys.projects(),
    queryFn: () => api.listProjects(),
    enabled: Boolean(user),
  })
  const { data: environmentsData, error: environmentsErrorRaw } = useQuery<EnvironmentDto[]>({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })
  const { data: matrixData, error: matrixErrorRaw, isLoading } = useQuery<FeatureFlagMatrixRowDto[]>({
    queryKey: queryKeys.flagsMatrix(projectId),
    queryFn: () => api.getFlagsMatrix(projectId),
    enabled: Boolean(user) && Boolean(projectId),
  })

  const projects = asArray(projectsData)
  const environments = asArray(environmentsData)
  const matrix = asArray(matrixData)
  const selectedProject = projects.find((project) => project.id === projectId) ?? null

  const error =
    (projectsErrorRaw && getErrorMessage(projectsErrorRaw)) ||
    (environmentsErrorRaw && getErrorMessage(environmentsErrorRaw)) ||
    (matrixErrorRaw && getErrorMessage(matrixErrorRaw)) ||
    null

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Feature flags matrix"
        subtitle={`Project: ${selectedProject?.name ?? projectId.slice(0, 6)}`}
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(flagEnvironmentsPath(projectId, selectedProject?.slug))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to flags
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <SectionCard>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading matrix...</p>
        ) : matrix.length === 0 ? (
          <p className="text-muted-foreground text-sm">No flags found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag</TableHead>
                {environments.map((environment) => (
                  <TableHead key={environment.id}>{environment.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map((row) => (
                <TableRow key={row.flagId}>
                  <TableCell>
                    <p className="text-sm font-semibold">{row.flagKey}</p>
                  </TableCell>
                  {row.environments.map((cell) => (
                    <TableCell key={`${row.flagId}-${cell.environmentId}`}>
                      {cell.snapshot ? (
                        <div className="space-y-1">
                          <Badge variant={cell.snapshot.exposed ? 'default' : 'secondary'}>
                            {cell.snapshot.exposed ? 'Exposed' : 'Hidden'}
                          </Badge>
                          <p className="text-xs">
                            {cell.snapshot.valueType === 'BOOLEAN'
                              ? cell.snapshot.booleanValue
                                ? 'Enabled'
                                : 'Disabled'
                              : 'JSON configured'}
                          </p>
                        </div>
                      ) : (
                        <Badge variant="outline">Missing</Badge>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </section>
  )
}
