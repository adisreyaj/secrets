import { prisma } from '../../db.js';

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
    const existing = await prisma.project.findUnique({ where: { slug: candidate } });
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
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
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
    const existing = await prisma.environment.findFirst({
      where: { projectId, slug: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalized}-${suffix}`.slice(0, 64);
  }
}
