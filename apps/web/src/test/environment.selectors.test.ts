import { describe, expect, it } from 'vitest'
import {
  buildMissingKeys,
  buildMissingKeysByEnvironment,
} from '../features/environment/selectors'

describe('environment selectors', () => {
  it('builds missing keys deterministically', () => {
    const missing = buildMissingKeys(
      {
        env1: ['A', 'B'],
        env2: ['B', 'C'],
      },
      [{ id: '1', environmentId: 'env1', key: 'B', updatedAt: '' }],
    )

    expect(missing).toEqual(['A', 'C'])
  })

  it('builds missing keys grouped by other environments', () => {
    const missing = buildMissingKeysByEnvironment(
      [
        { id: 'env1', projectId: 'p', name: 'Dev', createdAt: '', updatedAt: '' },
        { id: 'env2', projectId: 'p', name: 'Staging', createdAt: '', updatedAt: '' },
        { id: 'env3', projectId: 'p', name: 'Prod', createdAt: '', updatedAt: '' },
      ],
      'env1',
      {
        env2: ['A', 'B'],
        env3: ['B', 'C'],
      },
      [{ id: '1', environmentId: 'env1', key: 'B', updatedAt: '' }],
    )

    expect(missing).toEqual({
      env2: ['A'],
      env3: ['C'],
    })
  })
})
