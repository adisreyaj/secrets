import { useEffect } from 'react'
import { useAuth } from './auth'

export const useRequireAuth = (
  navigate: (path: string) => void,
  redirectPath = '/login',
) => {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      navigate(redirectPath)
    }
  }, [loading, user, navigate, redirectPath])

  return { user, loading }
}
