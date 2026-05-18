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

  it('resolves core routes only', () => {
    expect(getRouteMatch('/projects/p1/environments/e1', '')).toEqual({
      name: 'environment',
      projectId: 'p1',
      environmentId: 'e1',
    })
    expect(getRouteMatch('/projects/p1/tokens', '')).toEqual({
      name: 'tokens',
      projectId: 'p1',
    })
    expect(getRouteMatch('/projects/p1/flags/environments/e1', '')).toEqual({
      name: 'projects',
    })
    expect(getRouteMatch('/projects/p1/auth/environments/e1', '')).toEqual({
      name: 'projects',
    })
  })

  it('returns null for non project routes', () => {
    const match: RouteMatch = { name: 'login' }
    expect(isProjectScopedRoute(match)).toBe(false)
    expect(getProjectId(match)).toBeNull()
  })
})
