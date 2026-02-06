import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth'
import { createNoopAdapter } from './adapters/noop'
import { createPosthogAdapter } from './adapters/posthog'
import { getFeatureFlagConfig } from './config'
import type {
  FeatureFlagConfig,
  FeatureFlagProviderAdapter,
  FeatureFlagValue,
} from './types'

interface FeatureFlagContextValue {
  adapter: FeatureFlagProviderAdapter
  version: number
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(
  undefined,
)

const getFeatureFlagAdapter = (
  config: FeatureFlagConfig,
): FeatureFlagProviderAdapter => {
  if (!config.provider || config.provider === 'none') {
    return createNoopAdapter()
  }

  if (config.provider === 'posthog') {
    if (!config.posthogKey) return createNoopAdapter()
    return createPosthogAdapter()
  }

  return createNoopAdapter()
}

export const FeatureFlagProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const config = useMemo(() => getFeatureFlagConfig(), [])
  const adapterRef = useRef<FeatureFlagProviderAdapter>()
  if (!adapterRef.current) {
    adapterRef.current = getFeatureFlagAdapter(config)
  }

  const [version, setVersion] = useState(0)

  useEffect(() => {
    const adapter = adapterRef.current
    void adapter.init(config)
    const unsubscribe = adapter.onFlagsChanged?.(() => {
      setVersion((current) => current + 1)
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [config])

  useEffect(() => {
    const adapter = adapterRef.current
    if (!user) {
      adapter.reset()
      return
    }
    adapter.identify({
      id: user.id,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    })
  }, [user])

  const value = useMemo(
    () => ({
      adapter: adapterRef.current,
      version,
    }),
    [version],
  )

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  )
}

const useFeatureFlagContext = () => {
  const ctx = useContext(FeatureFlagContext)
  if (!ctx) {
    throw new Error('useFeatureFlag must be used within FeatureFlagProvider')
  }
  return ctx
}

export const useFeatureFlag = <T extends FeatureFlagValue>(
  key: string,
  defaultValue: T,
): T => {
  const { adapter, version } = useFeatureFlagContext()
  void version
  return adapter.getFlag(key, defaultValue)
}

export const useFlagEnabled = (key: string, defaultValue = false) => {
  return useFeatureFlag<boolean>(key, defaultValue)
}

export const useFeatureFlags = (
  keys: string[],
  defaults: Record<string, FeatureFlagValue> = {},
) => {
  const { adapter, version } = useFeatureFlagContext()
  void version
  const result: Record<string, FeatureFlagValue> = {}
  for (const key of keys) {
    result[key] = adapter.getFlag(
      key,
      (defaults[key] ?? null) as FeatureFlagValue,
    )
  }
  return result
}
