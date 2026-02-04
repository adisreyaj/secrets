import { useEffect, useMemo, useState } from 'react'

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
  | { name: 'team'; projectId: string }
  | { name: 'tokens'; projectId: string }
  | { name: 'service-accounts'; projectId: string }

const normalize = (value: string) => value.replace(/\/+$/, '').trim()

const parseRoute = (pathWithQuery: string): RouteMatch => {
  const [path, query] = pathWithQuery.split('?')
  const raw = normalize(path) || '/'
  const segments = raw.replace(/^\//, '').split('/').filter(Boolean)
  const queryParams = new URLSearchParams(query ?? '')

  if (segments.length === 0) {
    return { name: 'projects' }
  }

  if (segments[0] === 'login') {
    return { name: 'login' }
  }

  if (segments[0] === 'cli-login') {
    return { name: 'cli-login', code: queryParams.get('code') }
  }

  if (segments[0] === 'invite') {
    return { name: 'invite', token: queryParams.get('token') }
  }

  if (segments[0] === 'profile') {
    return { name: 'profile' }
  }

  if (segments[0] === 'projects') {
    if (segments.length === 1) {
      return { name: 'projects' }
    }
    if (segments.length >= 2) {
      const projectId = segments[1]
      if (segments[2] === 'environments' && segments[3]) {
        return { name: 'environment', projectId, environmentId: segments[3] }
      }
      if (segments[2] === 'environments') {
        return { name: 'environments', projectId }
      }
      if (segments[2] === 'audit') {
        return { name: 'audit', projectId }
      }
      if (segments[2] === 'approvals') {
        return { name: 'approvals', projectId }
      }
      if (segments[2] === 'approval-rules') {
        return { name: 'approval-rules', projectId }
      }
      if (segments[2] === 'team') {
        return { name: 'team', projectId }
      }
      if (segments[2] === 'tokens') {
        return { name: 'tokens', projectId }
      }
      if (segments[2] === 'service-accounts') {
        return { name: 'service-accounts', projectId }
      }
      return { name: 'project', projectId }
    }
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
  match.name === 'team' ||
  match.name === 'tokens' ||
  match.name === 'service-accounts'

export const getProjectId = (match: RouteMatch) =>
  isProjectScopedRoute(match) ? match.projectId : null

export const getEnvironmentId = (match: RouteMatch) =>
  match.name === 'environment' ? match.environmentId : null

const readLocationPath = () =>
  `${window.location.pathname}${window.location.search}`

export const useBrowserRouter = () => {
  const [path, setPath] = useState(() => readLocationPath())

  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#/')) {
      const normalized = hash.replace(/^#/, '')
      const next = normalized.startsWith('/') ? normalized : `/${normalized}`
      window.history.replaceState({}, '', next)
      setPath(next)
    }
  }, [])

  useEffect(() => {
    const handler = () => setPath(readLocationPath())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const match = useMemo(() => parseRoute(path), [path])

  const navigate = (nextPath: string) => {
    const normalized = nextPath.startsWith('/')
      ? nextPath
      : `/${nextPath}`
    if (readLocationPath() !== normalized) {
      window.history.pushState({}, '', normalized)
      setPath(normalized)
    }
  }

  return { match, navigate, path }
}
