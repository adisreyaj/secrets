import type { DependencyList } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from './errors'

export const useAsyncResource = <T>(
  loader: () => Promise<T>,
  deps: DependencyList,
) => {
  const loaderRef = useRef(loader)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loaderRef.current()
      setData(result)
      return result
    } catch (err) {
      setError(getErrorMessage(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const triggerRef = useRef(-1)
  const prevDepsRef = useRef(deps)
  const depsChanged =
    prevDepsRef.current.length !== deps.length ||
    prevDepsRef.current.some((d, i) => d !== deps[i])
  if (depsChanged || triggerRef.current === -1) {
    prevDepsRef.current = deps
    triggerRef.current += 1
  }
  const trigger = triggerRef.current

  useEffect(() => {
    void reload()
  }, [reload, trigger])

  return { data, loading, error, reload, setData }
}
