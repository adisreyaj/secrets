import type { FastifyRequest } from 'fastify';

export function parseHeaderValue(header?: string | string[]): string | null {
  if (!header) return null;
  return Array.isArray(header) ? header[0] ?? null : header;
}

export function toOrigin(value: string): string | null {
  try {
    return new URL(value).origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getRequestOrigin(request: FastifyRequest): string | null {
  const originHeader = parseHeaderValue(request.headers.origin);
  if (originHeader) {
    const origin = toOrigin(originHeader);
    if (origin) return origin;
  }

  const refererHeader = parseHeaderValue(request.headers.referer);
  if (refererHeader) {
    const refererOrigin = toOrigin(refererHeader);
    if (refererOrigin) return refererOrigin;
  }

  return null;
}

export function parseDateInput(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isRole(value: string): value is 'ADMIN' | 'EDITOR' | 'VIEWER' {
  return value === 'ADMIN' || value === 'EDITOR' || value === 'VIEWER';
}
