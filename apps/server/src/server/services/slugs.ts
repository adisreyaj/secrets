import { and, eq } from 'drizzle-orm';
import { db, environments, organizations, projects } from '../../db/index.js';

export function slugify(value: string, fallback: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base.length > 0 ? base : fallback;
}

export async function ensureUniqueProjectSlug(base: string): Promise<string> {
  const normalized = slugify(base, 'project').slice(0, 48);
  let candidate = normalized;
  let suffix = 1;
  while (true) {
    const existing = await db.query.projects.findFirst({
      where: eq(projects.slug, candidate),
      columns: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalized}-${suffix}`.slice(0, 64);
  }
}

export async function ensureUniqueOrganizationSlug(base: string): Promise<string> {
  const normalized = slugify(base, 'organization').slice(0, 48);
  let candidate = normalized;
  let suffix = 1;
  while (true) {
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, candidate),
      columns: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalized}-${suffix}`.slice(0, 64);
  }
}

export async function ensureUniqueEnvironmentSlug(projectId: string, base: string): Promise<string> {
  const normalized = slugify(base, 'env').slice(0, 48);
  let candidate = normalized;
  let suffix = 1;
  while (true) {
    const existing = await db.query.environments.findFirst({
      where: and(eq(environments.projectId, projectId), eq(environments.slug, candidate)),
      columns: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalized}-${suffix}`.slice(0, 64);
  }
}
