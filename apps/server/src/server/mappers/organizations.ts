import type { Role } from '@prisma/client';

export function toOrganizationDto(organization: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

export function toOrganizationMemberDto(member: {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: Date;
  user: {
    email: string;
    name: string | null;
  };
}) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}
