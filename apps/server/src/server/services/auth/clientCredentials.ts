import { hashToken } from '../../../auth.js';
import { prisma } from '../../../db.js';

export async function authenticateAuthClient(params: {
  projectId: string;
  clientId: string;
  clientSecret?: string;
}) {
  const client = await prisma.authClient.findFirst({
    where: {
      projectId: params.projectId,
      clientId: params.clientId,
      deletedAt: null,
    },
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
