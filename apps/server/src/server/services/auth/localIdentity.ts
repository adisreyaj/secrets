import { and, eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../../auth.js';
import {
  AuthIdentityProvider,
  authEndUsers,
  authIdentities,
  db,
} from '../../../db/index.js';

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

  return db.transaction(async (tx) => {
    const [endUser] = await tx
      .insert(authEndUsers)
      .values({
        projectId: params.projectId,
        email: normalizedEmail,
        displayName: params.displayName ?? null,
      })
      .returning();

    const [identity] = await tx
      .insert(authIdentities)
      .values({
        projectId: params.projectId,
        endUserId: endUser.id,
        provider: AuthIdentityProvider.LOCAL,
        providerSubject: normalizedEmail,
        passwordHash,
      })
      .returning();

    return { endUser, identity };
  });
}

export async function verifyLocalCredentials(params: {
  projectId: string;
  email: string;
  password: string;
}): Promise<VerifyLocalCredentialsResult> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const identity = await db.query.authIdentities.findFirst({
    where: and(
      eq(authIdentities.projectId, params.projectId),
      eq(authIdentities.provider, AuthIdentityProvider.LOCAL),
      eq(authIdentities.providerSubject, normalizedEmail),
    ),
    with: {
      endUser: {
        columns: {
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
  return db
    .update(authIdentities)
    .set({ passwordHash })
    .where(
      and(
        eq(authIdentities.projectId, params.projectId),
        eq(authIdentities.endUserId, params.endUserId),
        eq(authIdentities.provider, AuthIdentityProvider.LOCAL),
      ),
    );
}
