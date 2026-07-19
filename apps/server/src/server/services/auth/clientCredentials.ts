import { and, eq, isNull } from 'drizzle-orm';
import { hashToken } from '../../../auth.js';
import { authClients, db } from '../../../db/index.js';

export async function authenticateAuthClient(params: {
  projectId: string;
  clientId: string;
  clientSecret?: string;
}) {
  const client = await db.query.authClients.findFirst({
    where: and(
      eq(authClients.projectId, params.projectId),
      eq(authClients.clientId, params.clientId),
      isNull(authClients.deletedAt),
    ),
  });
  if (!client) {
    return null;
  }

  if (client.type === 'PUBLIC') {
    return client;
  }

  if (!params.clientSecret || !client.clientSecretHash) {
    return null;
  }

  if (hashToken(params.clientSecret) !== client.clientSecretHash) {
    return null;
  }

  return client;
}
