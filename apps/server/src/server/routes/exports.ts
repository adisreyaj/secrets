import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { decryptSecret, loadMasterKey } from '../../crypto.js';
import { prisma } from '../../db.js';
import { requireAuth, requireProjectRole } from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { formatDotenvValue } from '../services/format.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const masterKey = loadMasterKey();

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

    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) {
      sendError(reply, 404, 'Environment not found');
      return;
    }

    const role = await requireProjectRole(request, reply, env.projectId, Role.EDITOR);
    if (!role) {
      return;
    }

    const secrets = await prisma.secret.findMany({
      where: { environmentId: envId, deletedAt: null },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { key: 'asc' },
    });

    const lines: string[] = [];
    for (const secret of secrets) {
      const version = secret.versions[0];
      if (!version) {
        continue;
      }
      const value = decryptSecret(
        { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
        masterKey,
      );
      lines.push(`${secret.key}=${formatDotenvValue(value)}`);
    }

    const output = `${lines.join('\n')}\n`;
    reply.type('text/plain').send(output);
  });
}
