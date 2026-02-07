const LAST_PROJECT_KEY = 'secrets:lastProjectId'
const SHORTCUT_HINTS_KEY = 'secrets:showShortcutHints'
const lastEnvironmentKey = (projectId: string) =>
  `secrets:lastEnvironmentId:${projectId}`

export const getShortcutHintsEnabled = () => {
  try {
    const value = window.localStorage.getItem(SHORTCUT_HINTS_KEY)
    if (value === null) return true
    return value === 'true'
  } catch {
    return true
  }
}

export const setShortcutHintsEnabled = (value: boolean) => {
  try {
    window.localStorage.setItem(SHORTCUT_HINTS_KEY, String(value))
  } catch {
    // no-op
  }
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

export const setLastEnvironmentId = (
  projectId: string,
  environmentId: string,
) => {
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
