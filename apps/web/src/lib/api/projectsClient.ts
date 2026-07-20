import type {
    AcceptInviteRequest,
    AcceptInviteResponse,
    CreateEnvironmentRequest,
    CreateInviteRequest,
    CreateInviteResponse,
    CreateProjectRequest,
    CursorPage,
    DeleteEnvironmentRequest,
    DeleteProjectRequest,
    EnvironmentDto,
    ProjectDto,
    ProjectInviteDto,
    ProjectMemberDto,
    ProjectModuleDto,
    UpdateProjectModuleRequest,
    UpdateProjectRequest,
} from '@secrets/shared'
import type { ApiFetchFn } from '../apiBase'
import { unwrapCursorPage } from '../queryResult'

export const createProjectsClient = (apiFetch: ApiFetchFn) => ({
  listProjects: async () => {
    const page = await apiFetch<CursorPage<ProjectDto>>('/projects')
    return unwrapCursorPage(page)
  },
  createProject: (payload: CreateProjectRequest) =>
    apiFetch<ProjectDto>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProject: (projectId: string, payload: UpdateProjectRequest) =>
    apiFetch<ProjectDto>(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteProject: (projectId: string, payload: DeleteProjectRequest) =>
    apiFetch<{ ok: true }>(`/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),
  getProjectBySlug: (slug: string) =>
    apiFetch<ProjectDto>(`/projects/slug/${slug}`),
  listProjectModules: (projectId: string) =>
    apiFetch<ProjectModuleDto[]>(`/projects/${projectId}/modules`),
  updateProjectModule: (
    projectId: string,
    module: 'secrets' | 'flags' | 'auth',
    payload: UpdateProjectModuleRequest,
  ) =>
    apiFetch<ProjectModuleDto>(`/projects/${projectId}/modules/${module}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  listEnvironments: async (projectId: string) => {
    const page = await apiFetch<CursorPage<EnvironmentDto>>(
      `/projects/${projectId}/environments`,
    )
    return unwrapCursorPage(page)
  },
  createEnvironment: (projectId: string, payload: CreateEnvironmentRequest) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteEnvironment: (
    projectId: string,
    environmentId: string,
    payload: DeleteEnvironmentRequest,
  ) =>
    apiFetch<{ ok: true }>(
      `/projects/${projectId}/environments/${environmentId}`,
      {
        method: 'DELETE',
        body: JSON.stringify(payload),
      },
    ),
  getEnvironmentBySlug: (projectId: string, slug: string) =>
    apiFetch<EnvironmentDto>(`/projects/${projectId}/environments/slug/${slug}`),
  listInvites: (projectId: string) =>
    apiFetch<ProjectInviteDto[]>(`/projects/${projectId}/invites`),
  listMembers: (projectId: string) =>
    apiFetch<ProjectMemberDto[]>(`/projects/${projectId}/members`),
  createInvite: (projectId: string, payload: CreateInviteRequest) =>
    apiFetch<CreateInviteResponse>(`/projects/${projectId}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revokeInvite: (projectId: string, inviteId: string) =>
    apiFetch<{ ok: true }>(`/projects/${projectId}/invites/${inviteId}`, {
      method: 'DELETE',
    }),
  acceptInvite: (payload: AcceptInviteRequest) =>
    apiFetch<AcceptInviteResponse>('/invites/accept', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
})
