import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'

type ShortcutHandler = () => void

type SingleKey = {
  type: 'single'
  key: string
  shift: boolean
}

type ChordKey = {
  type: 'chord'
  first: string
  second: string
  secondShift: boolean
}

type ShortcutKey = SingleKey | ChordKey

type ShortcutRegistration = {
  id: string
  key: ShortcutKey
  handler: ShortcutHandler
}

type ShortcutsContextValue = {
  register: (entry: ShortcutRegistration) => () => void
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null)

const LAST_PROJECT_KEY = 'secrets:lastProjectId'
const lastEnvironmentKey = (projectId: string) =>
  `secrets:lastEnvironmentId:${projectId}`

const normalizeKey = (value: string) => value.trim().toLowerCase()

const parseToken = (token: string) => {
  const normalized = token.trim()
  if (normalized.startsWith('shift+')) {
    return { key: normalizeKey(normalized.replace(/^shift\+/, '')), shift: true }
  }
  return { key: normalizeKey(normalized), shift: false }
}

const parseShortcut = (definition: string): ShortcutKey => {
  const parts = definition.split(' ').filter(Boolean)
  if (parts.length === 2) {
    const first = parseToken(parts[0])
    const second = parseToken(parts[1])
    return {
      type: 'chord',
      first: first.key,
      second: second.key,
      secondShift: second.shift,
    }
  }

  const token = parseToken(definition)
  return { type: 'single', key: token.key, shift: token.shift }
}

const isEditableElement = (target: EventTarget | null) => {
  if (!target || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

const matchesSingleKey = (event: KeyboardEvent, entry: SingleKey) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (entry.key === '?') {
    return event.key === '?'
  }

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key !== entry.key) return false
  return event.shiftKey === entry.shift
}

const matchesChordKey = (event: KeyboardEvent, entry: ChordKey) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key !== entry.second) return false
  return event.shiftKey === entry.secondShift
}

export const ShortcutsProvider = ({ children }: { children: ReactNode }) => {
  const registryRef = useRef<ShortcutRegistration[]>([])
  const chordTimeoutRef = useRef<number | null>(null)
  const pendingChordRef = useRef<string | null>(null)

  const register = useCallback((entry: ShortcutRegistration) => {
    registryRef.current = [...registryRef.current, entry]
    return () => {
      registryRef.current = registryRef.current.filter((item) => item.id !== entry.id)
    }
  }, [])

  useEffect(() => {
    const clearChord = () => {
      pendingChordRef.current = null
      if (chordTimeoutRef.current !== null) {
        window.clearTimeout(chordTimeoutRef.current)
        chordTimeoutRef.current = null
      }
    }

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isEditableElement(event.target)) return

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

      if (pendingChordRef.current) {
        const matches = registryRef.current.filter((entry) => entry.key.type === 'chord')
        for (const entry of matches) {
          if (
            entry.key.type === 'chord' &&
            entry.key.first === pendingChordRef.current &&
            matchesChordKey(event, entry.key)
          ) {
            event.preventDefault()
            clearChord()
            entry.handler()
            return
          }
        }
        clearChord()
      }

      if (key === 'g' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        pendingChordRef.current = 'g'
        if (chordTimeoutRef.current !== null) {
          window.clearTimeout(chordTimeoutRef.current)
        }
        chordTimeoutRef.current = window.setTimeout(() => {
          pendingChordRef.current = null
          chordTimeoutRef.current = null
        }, 800)
        return
      }

      const matches = registryRef.current.filter((entry) => entry.key.type === 'single')
      for (const entry of matches) {
        if (entry.key.type === 'single' && matchesSingleKey(event, entry.key)) {
          event.preventDefault()
          entry.handler()
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const value = useMemo<ShortcutsContextValue>(() => ({ register }), [register])

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>
}

export const useRegisterShortcut = (
  keys: string | string[],
  handler: ShortcutHandler,
  options?: { enabled?: boolean },
) => {
  const context = useContext(ShortcutsContext)
  const enabled = options?.enabled ?? true
  const stableHandler = useRef(handler)

  useEffect(() => {
    stableHandler.current = handler
  }, [handler])

  useEffect(() => {
    if (!context || !enabled) return
    const idBase = Math.random().toString(36).slice(2)
    const list = Array.isArray(keys) ? keys : [keys]
    const cleanups = list.map((entry, index) => {
      const key = parseShortcut(entry)
      return context.register({
        id: `${idBase}-${index}`,
        key,
        handler: () => stableHandler.current(),
      })
    })
    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [context, enabled, keys])
}

export const setLastProjectId = (projectId: string) => {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, projectId)
  } catch {
    // no-op
  }
}

export const getLastProjectId = () => {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

export const setLastEnvironmentId = (projectId: string, environmentId: string) => {
  try {
    window.localStorage.setItem(lastEnvironmentKey(projectId), environmentId)
  } catch {
    // no-op
  }
}

export const getLastEnvironmentId = (projectId: string) => {
  try {
    return window.localStorage.getItem(lastEnvironmentKey(projectId))
  } catch {
    return null
  }
}
