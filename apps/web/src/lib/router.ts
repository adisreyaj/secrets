import { matchRoutes, type RouteObject } from 'react-router-dom'

export type RouteMatch =
  | { name: 'login' }
  | { name: 'cli-login'; code?: string | null }
  | { name: 'invite'; token?: string | null }
  | { name: 'projects' }
  | { name: 'profile' }
  | { name: 'project'; projectId: string }
  | { name: 'environments'; projectId: string }
  | { name: 'environment'; projectId: string; environmentId: string }
  | { name: 'audit'; projectId: string }
  | { name: 'approvals'; projectId: string }
  | { name: 'approval-rules'; projectId: string }
  | { name: 'flag-environments'; projectId: string }
  | { name: 'flag-environment'; projectId: string; environmentId: string }
  | { name: 'flags-matrix'; projectId: string }
  | { name: 'flags'; projectId: string; environmentId?: string }
  | { name: 'flag-sdk-keys'; projectId: string; environmentId?: string }
  | { name: 'auth-environments'; projectId: string }
  | { name: 'auth-environment'; projectId: string; environmentId: string }
  | { name: 'auth'; projectId: string }
  | { name: 'team'; projectId: string }
  | { name: 'tokens'; projectId: string }
  | { name: 'service-accounts'; projectId: string }

export const appRoutes: RouteObject[] = [
  { path: '/login', handle: { name: 'login' } },
  { path: '/cli-login', handle: { name: 'cli-login' } },
  { path: '/invite', handle: { name: 'invite' } },
  { path: '/profile', handle: { name: 'profile' } },
  { path: '/projects', handle: { name: 'projects' } },
  { path: '/projects/:projectId', handle: { name: 'project' } },
  {
    path: '/projects/:projectId/environments',
    handle: { name: 'environments' },
  },
  {
    path: '/projects/:projectId/environments/:environmentId',
    handle: { name: 'environment' },
  },
  { path: '/projects/:projectId/audit', handle: { name: 'audit' } },
  { path: '/projects/:projectId/approvals', handle: { name: 'approvals' } },
  {
    path: '/projects/:projectId/approval-rules',
    handle: { name: 'approval-rules' },
  },
  {
    path: '/projects/:projectId/flags/environments',
    handle: { name: 'flag-environments' },
  },
  {
    path: '/projects/:projectId/flags/environments/:environmentId',
    handle: { name: 'flag-environment' },
  },
  {
    path: '/projects/:projectId/flags/matrix',
    handle: { name: 'flags-matrix' },
  },
  {
    path: '/projects/:projectId/environments/:environmentId/flags',
    handle: { name: 'flags' },
  },
  { path: '/projects/:projectId/flags', handle: { name: 'flags' } },
  {
    path: '/projects/:projectId/environments/:environmentId/flag-sdk-keys',
    handle: { name: 'flag-sdk-keys' },
  },
  {
    path: '/projects/:projectId/flag-sdk-keys',
    handle: { name: 'flag-sdk-keys' },
  },
  { path: '/projects/:projectId/auth/environments', handle: { name: 'auth-environments' } },
  {
    path: '/projects/:projectId/auth/environments/:environmentId',
    handle: { name: 'auth-environment' },
  },
  { path: '/projects/:projectId/auth', handle: { name: 'auth' } },
  { path: '/projects/:projectId/team', handle: { name: 'team' } },
  { path: '/projects/:projectId/tokens', handle: { name: 'tokens' } },
  {
    path: '/projects/:projectId/service-accounts',
    handle: { name: 'service-accounts' },
  },
]

export const getRouteMatch = (pathname: string, search: string): RouteMatch => {
  const matches = matchRoutes(appRoutes, { pathname })
  const current = matches?.[matches.length - 1]
  const name = current?.route.handle?.name as RouteMatch['name'] | undefined
  const params = current?.params ?? {}
  const queryParams = new URLSearchParams(search)

  if (name === 'login') return { name: 'login' }
  if (name === 'cli-login') {
    return { name: 'cli-login', code: queryParams.get('code') }
  }
  if (name === 'invite') {
    return { name: 'invite', token: queryParams.get('token') }
  }
  if (name === 'profile') return { name: 'profile' }
  if (name === 'projects') return { name: 'projects' }
  if (name === 'project' && params.projectId) {
    return { name: 'project', projectId: params.projectId }
  }
  if (name === 'environments' && params.projectId) {
    return { name: 'environments', projectId: params.projectId }
  }
  if (name === 'environment' && params.projectId && params.environmentId) {
    return {
      name: 'environment',
      projectId: params.projectId,
      environmentId: params.environmentId,
    }
  }
  if (name === 'audit' && params.projectId) {
    return { name: 'audit', projectId: params.projectId }
  }
  if (name === 'approvals' && params.projectId) {
    return { name: 'approvals', projectId: params.projectId }
  }
  if (name === 'approval-rules' && params.projectId) {
    return { name: 'approval-rules', projectId: params.projectId }
  }
  if (name === 'flag-environments' && params.projectId) {
    return { name: 'flag-environments', projectId: params.projectId }
  }
  if (name === 'flag-environment' && params.projectId && params.environmentId) {
    return {
      name: 'flag-environment',
      projectId: params.projectId,
      environmentId: params.environmentId,
    }
  }
  if (name === 'flags-matrix' && params.projectId) {
    return { name: 'flags-matrix', projectId: params.projectId }
  }
  if (name === 'flags' && params.projectId) {
    return {
      name: 'flags',
      projectId: params.projectId,
      environmentId: params.environmentId,
    }
  }
  if (name === 'flag-sdk-keys' && params.projectId) {
    return {
      name: 'flag-sdk-keys',
      projectId: params.projectId,
      environmentId: params.environmentId,
    }
  }
  if (name === 'auth-environments' && params.projectId) {
    return { name: 'auth-environments', projectId: params.projectId }
  }
  if (name === 'auth-environment' && params.projectId && params.environmentId) {
    return {
      name: 'auth-environment',
      projectId: params.projectId,
      environmentId: params.environmentId,
    }
  }
  if (name === 'auth' && params.projectId) {
    return { name: 'auth', projectId: params.projectId }
  }
  if (name === 'team' && params.projectId) {
    return { name: 'team', projectId: params.projectId }
  }
  if (name === 'tokens' && params.projectId) {
    return { name: 'tokens', projectId: params.projectId }
  }
  if (name === 'service-accounts' && params.projectId) {
    return { name: 'service-accounts', projectId: params.projectId }
  }

  return { name: 'projects' }
}

export const isProjectScopedRoute = (match: RouteMatch) =>
  match.name === 'project' ||
  match.name === 'environments' ||
  match.name === 'environment' ||
  match.name === 'audit' ||
  match.name === 'approvals' ||
  match.name === 'approval-rules' ||
  match.name === 'flag-environments' ||
  match.name === 'flag-environment' ||
  match.name === 'flags-matrix' ||
  match.name === 'flags' ||
  match.name === 'flag-sdk-keys' ||
  match.name === 'auth-environments' ||
  match.name === 'auth-environment' ||
  match.name === 'auth' ||
  match.name === 'team' ||
  match.name === 'tokens' ||
  match.name === 'service-accounts'

export const getProjectId = (match: RouteMatch) =>
  isProjectScopedRoute(match) ? match.projectId : null

export const getEnvironmentId = (match: RouteMatch) =>
  match.name === 'environment' ||
  match.name === 'flag-environment' ||
  match.name === 'auth-environment' ||
  (match.name === 'flags' && !!match.environmentId) ||
  (match.name === 'flag-sdk-keys' && !!match.environmentId)
    ? match.environmentId ?? null
    : null
