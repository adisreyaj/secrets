import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '../../components/ui/button'
import { captureError } from './core'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { react: true, componentStack: info.componentStack })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">Something went wrong.</p>
        <p className="text-muted-foreground text-sm">
          Try reloading the page. If the issue persists, contact support.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    )
  }
}
