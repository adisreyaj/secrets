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

export const auditPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'audit')

export const tokensPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'tokens')

export const environmentPath = (
  projectId: string,
  _projectSlug: string | null | undefined,
  environmentId: string,
  _environmentSlug?: string | null,
) => `${environmentsPath(projectId)}/${pickSegment(environmentId)}`

export const flagsPath = (
  projectId: string,
  projectSlug?: string | null,
  environmentId?: string | null,
) =>
  environmentId
    ? projectPath(
        projectId,
        projectSlug,
        `flags/environments/${pickSegment(environmentId)}`,
      )
    : projectPath(projectId, projectSlug, 'flags/environments')

export const flagEnvironmentsPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'flags/environments')

export const flagEnvironmentPath = (
  projectId: string,
  projectSlug: string | null | undefined,
  environmentId: string,
) =>
  projectPath(
    projectId,
    projectSlug,
    `flags/environments/${pickSegment(environmentId)}`,
  )

export const flagsMatrixPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'flags/matrix')

export const authEnvironmentsPath = (
  projectId: string,
  projectSlug?: string | null,
) => projectPath(projectId, projectSlug, 'auth/environments')

export const authEnvironmentPath = (
  projectId: string,
  projectSlug: string | null | undefined,
  environmentId: string,
) =>
  projectPath(
    projectId,
    projectSlug,
    `auth/environments/${pickSegment(environmentId)}`,
  )

export const flagSdkKeysPath = (
  projectId: string,
  projectSlug?: string | null,
  environmentId?: string | null,
) =>
  environmentId
    ? projectPath(
        projectId,
        projectSlug,
        `environments/${pickSegment(environmentId)}/flag-sdk-keys`,
      )
    : projectPath(projectId, projectSlug, 'flag-sdk-keys')

export const projectPathFor = (project: ProjectDto) =>
  projectPath(project.id, project.slug)

export const environmentPathFor = (
  project: ProjectDto,
  environment: EnvironmentDto,
) => environmentPath(project.id, project.slug, environment.id, environment.slug)
