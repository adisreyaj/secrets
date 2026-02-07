import { config } from '../../config.js';

export function formatDotenvValue(value: string): string {
  if (/\s|#|"|\\|\n/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

export function buildCliLoginUrl(code: string): string {
  const base = config.appOrigin.replace(/\/$/, '');
  return `${base}/cli-login?code=${encodeURIComponent(code)}`;
}
