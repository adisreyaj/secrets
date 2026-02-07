export type DotenvEntry = { key: string; value: string; line: number }
export type DotenvInvalidLine = { line: number; text: string }

export const parseDotenv = (content: string) => {
  const entries = new Map<string, DotenvEntry>()
  const invalidLines: DotenvInvalidLine[] = []
  const duplicateKeys = new Set<string>()
  const lines = content.split(/\r?\n/)

  const normalizeValue = (value: string) => {
    if (value.startsWith('"') && value.endsWith('"')) {
      const inner = value.slice(1, -1)
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/"/g, '"')
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1)
    }
    const commentIndex = value.search(/\s+#/)
    if (commentIndex >= 0) {
      return value.slice(0, commentIndex).trimEnd()
    }
    return value
  }

  lines.forEach((raw, index) => {
    let line = raw.trim()
    if (!line || line.startsWith('#')) return
    if (line.startsWith('export ')) {
      line = line.slice(7).trim()
    }
    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0) {
      invalidLines.push({ line: index + 1, text: raw })
      return
    }
    const key = line.slice(0, equalsIndex).trim()
    const rawValue = line.slice(equalsIndex + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      invalidLines.push({ line: index + 1, text: raw })
      return
    }
    if (entries.has(key)) {
      duplicateKeys.add(key)
    }
    entries.set(key, { key, value: normalizeValue(rawValue), line: index + 1 })
  })

  return {
    entries: Array.from(entries.values()),
    invalidLines,
    duplicateKeys: Array.from(duplicateKeys.values()),
  }
}
