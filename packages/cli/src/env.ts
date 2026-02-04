export type EnvEntry = { key: string; value: string };

export function parseEnvFile(content: string): EnvEntry[] {
  const lines = content.split(/\r?\n/);
  const items: EnvEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    items.push({ key, value });
  }
  return items;
}

export function summarizeImportResults(results: { status?: string }[]): {
  created: number;
  pending: number;
} {
  let created = 0;
  let pending = 0;
  for (const result of results) {
    if (result?.status === 'pending') {
      pending += 1;
    } else {
      created += 1;
    }
  }
  return { created, pending };
}
