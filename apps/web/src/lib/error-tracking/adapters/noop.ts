import type { ErrorTrackingAdapter } from '../types'

export const noopErrorTrackingAdapter: ErrorTrackingAdapter = {
  init: () => {},
  identify: () => {},
  reset: () => {},
  captureError: () => {},
}
