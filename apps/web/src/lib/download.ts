const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export const downloadTextFile = (
  content: string,
  filename: string,
  type = 'text/plain',
) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const buildEnvFilename = (
  projectName: string | undefined,
  projectId: string,
  environmentName: string,
  environmentId: string,
) => {
  const projectSlug = toSlug(projectName ?? projectId.slice(0, 6)) || projectId.slice(0, 6)
  const environmentSlug = toSlug(environmentName) || environmentId.slice(0, 6)
  return `${projectSlug}-${environmentSlug}.env`
}

export const buildSecretsCsv = (
  rows: Array<{ key: string; value: string; updatedAt: string }>,
) => {
  const escape = (value: string) =>
    value.includes(',') || value.includes('"') || value.includes('\n')
      ? `"${value.replace(/"/g, '""')}"`
      : value

  const lines = ['key,value,updated_at']
  for (const row of rows) {
    lines.push(`${escape(row.key)},${escape(row.value)},${escape(row.updatedAt)}`)
  }
  return lines.join('\n')
}

export const slugify = toSlug
