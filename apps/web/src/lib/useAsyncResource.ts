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

  useEffect(() => {
    void reload()
  }, [reload, ...deps])

  return { data, loading, error, reload, setData }
}
