import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth'
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

const initAdapter = () => {
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
  const current = initAdapter()
  current.captureError(error, context)
}

const ErrorTrackingContext = createContext<ErrorTrackingAdapter | null>(null)

export const ErrorTrackingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()

  useEffect(() => {
    const current = initAdapter()
    const handleError = (event: ErrorEvent) => {
      captureError(event.error ?? event.message, {
        source: 'window.error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      captureError(event.reason, { source: 'window.unhandledrejection' })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
      current.reset()
    }
  }, [])

  useEffect(() => {
    const current = initAdapter()
    if (user?.id) {
      current.identify({ id: user.id })
    } else {
      current.reset()
    }
  }, [user?.id])

  const value = useMemo(() => initAdapter(), [])

  return (
    <ErrorTrackingContext.Provider value={value}>
      {children}
    </ErrorTrackingContext.Provider>
  )
}

export const useErrorTracking = () => {
  const ctx = useContext(ErrorTrackingContext)
  return ctx ?? initAdapter()
}
