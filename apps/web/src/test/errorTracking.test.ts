import { describe, expect, it } from 'vitest'
import { resolveErrorTrackingAdapter } from '../lib/error-tracking/provider'
import { noopErrorTrackingAdapter } from '../lib/error-tracking/adapters/noop'
import { posthogErrorTrackingAdapter } from '../lib/error-tracking/adapters/posthog'

describe('error tracking adapter resolution', () => {
  it('returns noop when disabled', () => {
    const adapter = resolveErrorTrackingAdapter({
      provider: 'posthog',
      enabled: false,
      posthogKey: 'key',
    })
    expect(adapter).toBe(noopErrorTrackingAdapter)
  })

  it('returns noop when provider is none', () => {
    const adapter = resolveErrorTrackingAdapter({
      provider: 'none',
      enabled: true,
    })
    expect(adapter).toBe(noopErrorTrackingAdapter)
  })

  it('returns noop when posthog key is missing', () => {
    const adapter = resolveErrorTrackingAdapter({
      provider: 'posthog',
      enabled: true,
    })
    expect(adapter).toBe(noopErrorTrackingAdapter)
  })

  it('returns posthog adapter when enabled and key exists', () => {
    const adapter = resolveErrorTrackingAdapter({
      provider: 'posthog',
      enabled: true,
      posthogKey: 'key',
    })
    expect(adapter).toBe(posthogErrorTrackingAdapter)
  })
})

describe('noop adapter', () => {
  it('does not throw when called', () => {
    expect(() => noopErrorTrackingAdapter.init({ provider: 'none' })).not.toThrow()
    expect(() => noopErrorTrackingAdapter.identify({ id: 'user' })).not.toThrow()
    expect(() => noopErrorTrackingAdapter.reset()).not.toThrow()
    expect(() => noopErrorTrackingAdapter.captureError(new Error('boom'))).not.toThrow()
  })
})
