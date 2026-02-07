import type { Role } from '@prisma/client';

export function toProjectDto(
  project: {
    id: string;
    name: string;
    slug: string | null;
    auditRetentionDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  role?: Role,
) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    auditRetentionDays: project.auditRetentionDays,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    role,
  };
}

export function toEnvironmentDto(env: {
  id: string;
  projectId: string;
  name: string;
  slug: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    slug: env.slug,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
  };
}
