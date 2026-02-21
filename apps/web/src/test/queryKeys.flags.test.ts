import { describe, expect, it } from 'vitest'
import { queryKeys } from '../lib/queryKeys'

describe('flags query keys', () => {
  it('includes environment id in flags key', () => {
    expect(queryKeys.flags('p1', 'env1')).toEqual([
      'projects',
      'p1',
      'flags',
      'env1',
    ])
  })

  it('uses all bucket when environment id is missing', () => {
    expect(queryKeys.flagSdkKeys('p1')).toEqual([
      'projects',
      'p1',
      'flag-sdk-keys',
      'all',
    ])
  })

  it('builds matrix key', () => {
    expect(queryKeys.flagsMatrix('p1')).toEqual([
      'projects',
      'p1',
      'flags',
      'matrix',
    ])
  })
})
