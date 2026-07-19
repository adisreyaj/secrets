import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, environments, Role, secrets } from '../../db/index.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { formatDotenvValue } from '../services/format.js';
import { decryptSecretWithKey, withEnvironmentDek } from '../services/envCrypto.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/environments/:id/export', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    const { id: envId } = request.params as { id: string };
    const format = request.query && (request.query as { format?: string }).format;
    if (format && format !== 'dotenv') {
      sendError(reply, 400, 'Unsupported format');
      return;
    }

    const env = await db.query.environments.findFirst({
      where: eq(environments.id, envId),
    });
    if (!env) {
      sendError(reply, 404, 'Environment not found');
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const secretRows = await db.query.secrets.findMany({
      where: and(eq(secrets.environmentId, envId), isNull(secrets.deletedAt)),
      with: {
        versions: {
          where: (fields, { eq: eqOp }) => eqOp(fields.isActive, true),
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: 1,
        },
      },
      orderBy: [asc(secrets.key)],
    });

    const dek = await withEnvironmentDek(envId, (d) => d);
    const lines: string[] = [];
    for (const secret of secretRows) {
      const version = secret.versions[0];
      if (!version) {
        continue;
      }
      const value = decryptSecretWithKey(
        { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
        dek,
        envId,
        secret.key,
      );
      lines.push(`${secret.key}=${formatDotenvValue(value)}`);
    }

    const output = `${lines.join('\n')}\n`;
    reply.type('text/plain').send(output);
  });
}
