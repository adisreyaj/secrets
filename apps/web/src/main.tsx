import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { AuthProvider } from './lib/auth'
import { ErrorBoundary, ErrorTrackingProvider } from './lib/error-tracking'
import { FeatureFlagProvider } from './lib/feature-flags'
import { ThemeProvider } from './lib/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorTrackingProvider>
            <FeatureFlagProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </FeatureFlagProvider>
          </ErrorTrackingProvider>
        </AuthProvider>
      </ThemeProvider>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  </StrictMode>,
)
