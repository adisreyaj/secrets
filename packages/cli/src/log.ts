import process from 'node:process'

export type DebugData = Record<string, unknown>
export type DebugLogger = (event: string, data?: DebugData) => void

const REDACTED = '[REDACTED]'
const MAX_STRING_LENGTH = 2048

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase()
  return (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('api-key') ||
    normalized.includes('apikey')
  )
}

function truncateString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}... (truncated ${value.length - MAX_STRING_LENGTH} chars)`
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return truncateString(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry))
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const redacted: Record<string, unknown> = {}
    for (const [key, entry] of entries) {
      if (shouldRedactKey(key)) {
        redacted[key] = REDACTED
      } else {
        redacted[key] = redactValue(entry)
      }
    }
    return redacted
  }

  return value
}

export function redactDebugData(data?: DebugData): DebugData | undefined {
  if (!data) {
    return undefined
  }
  return redactValue(data) as DebugData
}

export function createDebugLogger(enabled: boolean): DebugLogger {
  if (!enabled) {
    return () => {}
  }

  return (event: string, data?: DebugData) => {
    const timestamp = new Date().toISOString()
    const payload = redactDebugData(data)
    if (payload) {
      process.stderr.write(`[debug ${timestamp}] ${event} ${JSON.stringify(payload)}\n`)
      return
    }
    process.stderr.write(`[debug ${timestamp}] ${event}\n`)
  }
}
