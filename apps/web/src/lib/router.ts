import { matchRoutes, type RouteObject } from 'react-router-dom'

export type RouteMatch =
  | { name: 'login' }
  | { name: 'cli-login'; code?: string | null }
  | { name: 'profile' }
  | { name: 'projects' }
  | { name: 'project'; projectId: string }
  | { name: 'environments'; projectId: string }
  | { name: 'environment'; projectId: string; environmentId: string }
  | { name: 'audit'; projectId: string }
  | { name: 'tokens'; projectId: string }

export const appRoutes: RouteObject[] = [
  { path: '/login', handle: { name: 'login' } },
  { path: '/cli-login', handle: { name: 'cli-login' } },
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
  { path: '/projects/:projectId/tokens', handle: { name: 'tokens' } },
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
  if (name === 'tokens' && params.projectId) {
    return { name: 'tokens', projectId: params.projectId }
  }

  return { name: 'projects' }
}

export const isProjectScopedRoute = (match: RouteMatch) =>
  match.name === 'project' ||
  match.name === 'environments' ||
  match.name === 'environment' ||
  match.name === 'audit' ||
  match.name === 'tokens'

export const getProjectId = (match: RouteMatch) =>
  isProjectScopedRoute(match) ? match.projectId : null

export const getEnvironmentId = (match: RouteMatch) =>
  match.name === 'environment' ? match.environmentId : null
