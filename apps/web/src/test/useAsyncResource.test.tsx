import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsyncResource } from '../lib/useAsyncResource'

describe('useAsyncResource', () => {
  it('loads data and exposes it', async () => {
    const loader = vi.fn().mockResolvedValue(['a', 'b'])
    const { result } = renderHook(() => useAsyncResource(loader, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(['a', 'b'])
    expect(result.current.error).toBeNull()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('captures error state on failure', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('Nope'))
    const { result } = renderHook(() => useAsyncResource(loader, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Something went wrong.')
  })
})
