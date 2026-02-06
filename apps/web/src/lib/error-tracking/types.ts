export interface ErrorTrackingConfig {
  provider: 'posthog' | 'none' | string
  posthogKey?: string
  posthogHost?: string
  debug?: boolean
  enabled?: boolean
}

export interface ErrorTrackingAdapter {
  init: (config: ErrorTrackingConfig) => void | Promise<void>
  identify: (user: { id: string }) => void
  reset: () => void
  captureError: (error: unknown, context?: Record<string, unknown>) => void
}
