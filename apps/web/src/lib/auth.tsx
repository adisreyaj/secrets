import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { UserDto } from '@secrets/shared'
import { api, ApiError } from './api'

interface AuthContextValue {
  user: UserDto | null
  loading: boolean
  error: string | null
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: { email: string; password: string; name?: string }) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (payload: {
    name?: string
    currentPassword?: string
    newPassword?: string
  }) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const getErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong.'

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMe()
      setUser(data.user)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null)
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const login = async (payload: { email: string; password: string }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.login(payload)
      setUser(data.user)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const register = async (payload: { email: string; password: string; name?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.register(payload)
      setUser(data.user)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await api.logout()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (payload: {
    name?: string
    currentPassword?: string
    newPassword?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.updateMe(payload)
      setUser(data.user)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo(
    () => ({ user, loading, error, login, register, logout, updateProfile, refresh }),
    [user, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
