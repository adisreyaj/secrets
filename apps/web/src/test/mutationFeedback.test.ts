import { describe, expect, it, vi } from 'vitest'
import { runMutationWithToast } from '../lib/mutationFeedback'

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}))

describe('runMutationWithToast', () => {
  it('returns data and emits success toast', async () => {
    const onSuccess = vi.fn()

    const result = await runMutationWithToast(
      async () => ({ ok: true }),
      { successMessage: 'Saved.', onSuccess },
    )

    expect(result).toEqual({ ok: true })
    expect(onSuccess).toHaveBeenCalledWith({ ok: true })
    expect(toastSuccess).toHaveBeenCalledWith('Saved.')
  })

  it('returns undefined and emits error toast', async () => {
    const result = await runMutationWithToast(
      async () => {
        throw new Error('boom')
      },
      { errorMessage: 'Failed.' },
    )

    expect(result).toBeUndefined()
    expect(toastError).toHaveBeenCalledWith('Failed.')
  })
})
