import type { Role } from '@prisma/client';

export function toInviteDto(invite: {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
}) {
  return {
    id: invite.id,
    projectId: invite.projectId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
  };
}
