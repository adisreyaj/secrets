import { describe, expect, it } from 'vitest'
import {
  getRouteMatch,
  getEnvironmentId,
  getProjectId,
  isProjectScopedRoute,
  type RouteMatch,
} from '../lib/router'

describe('router helpers', () => {
  it('detects project scoped routes', () => {
    const match: RouteMatch = { name: 'project', projectId: 'p1' }
    expect(isProjectScopedRoute(match)).toBe(true)
    expect(getProjectId(match)).toBe('p1')
    expect(getEnvironmentId(match)).toBeNull()
  })

  it('detects environment route', () => {
    const match: RouteMatch = {
      name: 'environment',
      projectId: 'p1',
      environmentId: 'e1',
    }
    expect(getProjectId(match)).toBe('p1')
    expect(getEnvironmentId(match)).toBe('e1')
  })

  it('resolves environment id for canonical flags route', () => {
    const match = getRouteMatch(
      '/projects/p1/flags/environments/e1',
      '',
    )
    expect(match).toEqual({ name: 'flag-environment', projectId: 'p1', environmentId: 'e1' })
    expect(getEnvironmentId(match)).toBe('e1')
  })

  it('resolves auth environments route', () => {
    const match = getRouteMatch('/projects/p1/auth/environments/e1', '')
    expect(match).toEqual({
      name: 'auth-environment',
      projectId: 'p1',
      environmentId: 'e1',
    })
    expect(getEnvironmentId(match)).toBe('e1')
  })

  it('resolves module environment list routes', () => {
    expect(getRouteMatch('/projects/p1/auth/environments', '')).toEqual({
      name: 'auth-environments',
      projectId: 'p1',
    })
    expect(getRouteMatch('/projects/p1/flags/environments', '')).toEqual({
      name: 'flag-environments',
      projectId: 'p1',
    })
    expect(getRouteMatch('/projects/p1/flags/matrix', '')).toEqual({
      name: 'flags-matrix',
      projectId: 'p1',
    })
  })

  it('returns null for non project routes', () => {
    const match: RouteMatch = { name: 'login' }
    expect(isProjectScopedRoute(match)).toBe(false)
    expect(getProjectId(match)).toBeNull()
  })
})
