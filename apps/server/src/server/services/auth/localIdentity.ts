import { AuthIdentityProvider } from '@prisma/client';
import { hashPassword, verifyPassword } from '../../../auth.js';
import { prisma } from '../../../db.js';

export type VerifyLocalCredentialsResult =
  | { status: 'ok'; endUser: { id: string; projectId: string; email: string } }
  | { status: 'invalid_credentials' }
  | { status: 'disabled' };

export async function registerLocalIdentity(params: {
  projectId: string;
  email: string;
  password: string;
  displayName?: string | null;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const passwordHash = await hashPassword(params.password);

  return prisma.$transaction(async (tx) => {
    const endUser = await tx.authEndUser.create({
      data: {
        projectId: params.projectId,
        email: normalizedEmail,
        displayName: params.displayName ?? null,
      },
    });

    const identity = await tx.authIdentity.create({
      data: {
        projectId: params.projectId,
        endUserId: endUser.id,
        provider: AuthIdentityProvider.LOCAL,
        providerSubject: normalizedEmail,
        passwordHash,
      },
    });

    return { endUser, identity };
  });
}

export async function verifyLocalCredentials(params: {
  projectId: string;
  email: string;
  password: string;
}): Promise<VerifyLocalCredentialsResult> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const identity = await prisma.authIdentity.findFirst({
    where: {
      projectId: params.projectId,
      provider: AuthIdentityProvider.LOCAL,
      providerSubject: normalizedEmail,
    },
    include: {
      endUser: {
        select: {
          id: true,
          projectId: true,
          email: true,
          disabledAt: true,
        },
      },
    },
  });

  if (!identity?.passwordHash || !identity.endUser) {
    return { status: 'invalid_credentials' };
  }

  if (identity.endUser.disabledAt) {
    return { status: 'disabled' };
  }

  const valid = await verifyPassword(params.password, identity.passwordHash);
  if (!valid) {
    return { status: 'invalid_credentials' };
  }

  return {
    status: 'ok',
    endUser: {
      id: identity.endUser.id,
      projectId: identity.endUser.projectId,
      email: identity.endUser.email,
    },
  };
}

export async function rotateLocalPassword(params: {
  projectId: string;
  endUserId: string;
  nextPassword: string;
}) {
  const passwordHash = await hashPassword(params.nextPassword);
  return prisma.authIdentity.updateMany({
    where: {
      projectId: params.projectId,
      endUserId: params.endUserId,
      provider: AuthIdentityProvider.LOCAL,
    },
    data: { passwordHash },
  });
}
