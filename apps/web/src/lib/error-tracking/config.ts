import type { ErrorTrackingConfig } from './types'

export const getErrorTrackingConfig = (): ErrorTrackingConfig => ({
  provider: import.meta.env.VITE_ERROR_TRACKING_PROVIDER ?? 'posthog',
  posthogKey: import.meta.env.VITE_POSTHOG_KEY,
  posthogHost:
    import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
  debug: import.meta.env.VITE_ERROR_TRACKING_DEBUG === 'true',
  enabled: import.meta.env.PROD,
})
