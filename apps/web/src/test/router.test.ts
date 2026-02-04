import { describe, expect, it } from 'vitest'
import { getEnvironmentId, getProjectId, isProjectScopedRoute, type RouteMatch } from '../lib/router'

describe('router helpers', () => {
  it('detects project scoped routes', () => {
    const match: RouteMatch = { name: 'project', projectId: 'p1' }
    expect(isProjectScopedRoute(match)).toBe(true)
    expect(getProjectId(match)).toBe('p1')
    expect(getEnvironmentId(match)).toBeNull()
  })

  it('detects environment route', () => {
    const match: RouteMatch = { name: 'environment', projectId: 'p1', environmentId: 'e1' }
    expect(getProjectId(match)).toBe('p1')
    expect(getEnvironmentId(match)).toBe('e1')
  })

  it('returns null for non project routes', () => {
    const match: RouteMatch = { name: 'login' }
    expect(isProjectScopedRoute(match)).toBe(false)
    expect(getProjectId(match)).toBeNull()
  })
})
