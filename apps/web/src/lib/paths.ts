import type { EnvironmentDto, ProjectDto } from '@secrets/shared'

const pickSegment = (id: string, slug?: string | null) =>
  slug && slug.trim().length > 0 ? slug : id

export const projectPath = (
  projectId: string,
  projectSlug?: string | null,
  suffix?: string,
) => {
  const base = `/projects/${pickSegment(projectId, projectSlug)}`
  if (!suffix) return base
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
}

export const environmentsPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'environments')

export const environmentPath = (
  projectId: string,
  projectSlug: string | null | undefined,
  environmentId: string,
  environmentSlug?: string | null,
) =>
  `${environmentsPath(projectId, projectSlug)}/${pickSegment(
    environmentId,
    environmentSlug,
  )}`

export const projectPathFor = (project: ProjectDto) =>
  projectPath(project.id, project.slug)

export const environmentPathFor = (
  project: ProjectDto,
  environment: EnvironmentDto,
) => environmentPath(project.id, project.slug, environment.id, environment.slug)
