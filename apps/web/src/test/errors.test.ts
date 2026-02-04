import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'

describe('getErrorMessage', () => {
  it('returns ApiError message', () => {
    const error = new ApiError('Boom', 500)
    expect(getErrorMessage(error)).toBe('Boom')
  })

  it('returns fallback for unknown error', () => {
    expect(getErrorMessage(new Error('Oops'))).toBe('Something went wrong.')
  })
})
