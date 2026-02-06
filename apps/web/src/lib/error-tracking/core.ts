import { getErrorTrackingConfig } from './config'
import { noopErrorTrackingAdapter } from './adapters/noop'
import { posthogErrorTrackingAdapter } from './adapters/posthog'
import type { ErrorTrackingAdapter, ErrorTrackingConfig } from './types'

let adapter: ErrorTrackingAdapter = noopErrorTrackingAdapter
let initialized = false

export const resolveErrorTrackingAdapter = (
  config: ErrorTrackingConfig,
): ErrorTrackingAdapter => {
  if (!config.enabled) return noopErrorTrackingAdapter
  if (config.provider === 'none') return noopErrorTrackingAdapter
  if (config.provider === 'posthog' && config.posthogKey) {
    return posthogErrorTrackingAdapter
  }
  return noopErrorTrackingAdapter
}

export const initErrorTracking = () => {
  if (initialized) return adapter
  const config = getErrorTrackingConfig()
  adapter = resolveErrorTrackingAdapter(config)
  adapter.init(config)
  initialized = true
  return adapter
}

export const captureError = (
  error: unknown,
  context?: Record<string, unknown>,
) => {
  const current = initErrorTracking()
  current.captureError(error, context)
}
