import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth'
import type { ErrorTrackingAdapter } from './types'
import { captureError, initErrorTracking } from './core'

const ErrorTrackingContext = createContext<ErrorTrackingAdapter | null>(null)

export const ErrorTrackingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()

  useEffect(() => {
    const current = initErrorTracking()
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
    const current = initErrorTracking()
    if (user?.id) {
      current.identify({ id: user.id })
    } else {
      current.reset()
    }
  }, [user?.id])

  const value = useMemo(() => initErrorTracking(), [])

  return (
    <ErrorTrackingContext.Provider value={value}>
      {children}
    </ErrorTrackingContext.Provider>
  )
}

export const useErrorTracking = () => {
  const ctx = useContext(ErrorTrackingContext)
  return ctx ?? initErrorTracking()
}
