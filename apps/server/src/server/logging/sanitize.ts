const REDACTED = '[REDACTED]';

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

const SENSITIVE_KEY_MATCHERS = ['password', 'token', 'secret', 'value', 'ciphertext', 'iv', 'tag'];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_MATCHERS.some((candidate) => normalized.includes(candidate));
}

function sanitizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitizeForLogs(value);
  }
  return output;
}

export function sanitizeHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!headers) {
    return {};
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitizeForLogs(value);
  }
  return output;
}

export function sanitizeForLogs<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLogs(entry)) as T;
  }

  if (typeof value === 'object') {
    return sanitizeRecord(value as Record<string, unknown>) as T;
  }

  return value;
}
