import type { EnvironmentDto, ProjectDto } from '@secrets/shared'

const pickSegment = (id: string) => id

export const projectPath = (
  projectId: string,
  _projectSlug?: string | null,
  suffix?: string,
) => {
  const base = `/projects/${pickSegment(projectId)}`
  if (!suffix) return base
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
}

export const environmentsPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'environments')

export const environmentPath = (
  projectId: string,
  _projectSlug: string | null | undefined,
  environmentId: string,
  _environmentSlug?: string | null,
) =>
  `${environmentsPath(projectId)}/${pickSegment(environmentId)}`

export const projectPathFor = (project: ProjectDto) =>
  projectPath(project.id, project.slug)

export const environmentPathFor = (
  project: ProjectDto,
  environment: EnvironmentDto,
) => environmentPath(project.id, project.slug, environment.id, environment.slug)
