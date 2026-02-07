import posthog from 'posthog-js'
import type { ErrorTrackingAdapter, ErrorTrackingConfig } from '../types'

const normalizeError = (
  error: unknown,
  context?: Record<string, unknown>,
) => {
  const payload: Record<string, unknown> = { ...(context ?? {}) }

  if (error instanceof Error) {
    payload.name = error.name
    payload.message = error.message
    payload.stack = error.stack
    return payload
  }

  if (typeof error === 'string') {
    payload.message = error
    return payload
  }

  if (typeof error === 'object' && error) {
    try {
      payload.value = JSON.stringify(error)
    } catch {
      payload.value = String(error)
    }
    return payload
  }

  payload.message = 'Unknown error'
  return payload
}

export const posthogErrorTrackingAdapter: ErrorTrackingAdapter = {
  init: (config: ErrorTrackingConfig) => {
    if (!config.posthogKey) return
    posthog.init(config.posthogKey, {
      api_host: config.posthogHost,
      debug: config.debug,
      capture_pageview: false,
    })
  },
  identify: (user: { id: string }) => {
    posthog.identify(user.id)
  },
  reset: () => {
    posthog.reset()
  },
  captureError: (error: unknown, context?: Record<string, unknown>) => {
    posthog.capture('$exception', normalizeError(error, context))
  },
}
