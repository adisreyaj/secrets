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
  | { name: 'team'; projectId: string }
  | { name: 'tokens'; projectId: string }

const normalize = (value: string) => value.replace(/^#/, '').trim()

const parseRoute = (hash: string): RouteMatch => {
  const raw = normalize(hash) || '/'
  const [path, query] = raw.split('?')
  const segments = path.replace(/^\//, '').split('/').filter(Boolean)
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
      if (segments[2] === 'team') {
        return { name: 'team', projectId }
      }
      if (segments[2] === 'tokens') {
        return { name: 'tokens', projectId }
      }
      return { name: 'project', projectId }
    }
  }

  return { name: 'projects' }
}

export const useHashRouter = () => {
  const [hash, setHash] = useState(() => window.location.hash || '#/')

  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const match = useMemo(() => parseRoute(hash), [hash])

  const navigate = (path: string) => {
    const normalized = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`
    if (window.location.hash !== normalized) {
      window.location.hash = normalized
    }
  }

  return { match, navigate }
}
