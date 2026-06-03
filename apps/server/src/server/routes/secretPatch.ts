import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { masterKeyVersion } from '../../crypto.js';
import { prisma } from '../../db.js';
import {
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
} from '../auth/guards.js';
import { sendError } from '../http/replies.js';
import { normalizeIdentifier } from '../services/identifiers.js';
import { logAudit } from '../services/audit.js';
import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  withEnvironmentDek,
} from '../services/envCrypto.js';

const patchSecretParamsSchema = z.object({
  id: z.string().uuid('Invalid secret ID'),
});

const patchSecretBodySchema = z
  .object({
    key: z.string().min(1, 'Key cannot be empty').trim().optional(),
    value: z.string().optional(),
  })
  .refine((data) => data.key !== undefined || data.value !== undefined, {
    message: 'Key or value is required',
  });

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.patch(
    '/secrets/:id',
    {
      schema: {
        params: patchSecretParamsSchema,
        body: patchSecretBodySchema,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      const params = request.params as z.infer<typeof patchSecretParamsSchema>;
      const body = request.body as z.infer<typeof patchSecretBodySchema>;
      const { id: secretId } = params;
      const nextKey = body.key;
      const nextValue = body.value;

    const secret = await prisma.secret.findUnique({
      include: {
        environment: true,
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      where: { id: secretId },
    });
    if (!secret) {
      sendError(reply, 404, 'Secret not found');
      return;
    }
    if (!requireEnvironmentScope(request, reply, secret.environmentId)) {
      return;
    }

    const role = await requireProjectRole(
      request,
      reply,
      secret.environment.projectId,
      Role.EDITOR,
    );
    if (!role) {
      return;
    }

    const keyChanged = nextKey && nextKey !== secret.key;
    const normalizedKeyChanged =
      nextKey && normalizeIdentifier(nextKey) !== normalizeIdentifier(secret.key);
    if (normalizedKeyChanged && nextKey) {
      const siblings = await prisma.secret.findMany({
        where: { environmentId: secret.environmentId, deletedAt: null },
        select: { id: true, key: true },
      });
      const existing = siblings.find(
        (candidate) =>
          candidate.id !== secretId &&
          normalizeIdentifier(candidate.key) === normalizeIdentifier(nextKey),
      );
      if (existing) {
        sendError(reply, 409, 'Key already exists in this environment');
        return;
      }
    }

    const valueChanged = body.value !== undefined;
    const finalKey = nextKey ?? secret.key;

    const dek = await withEnvironmentDek(secret.environmentId, (d) => d);
    const keyVersion = masterKeyVersion();
    const transactionOps: Array<ReturnType<typeof prisma.secretVersion.updateMany> | ReturnType<typeof prisma.secretVersion.create> | ReturnType<typeof prisma.secretVersion.update> | ReturnType<typeof prisma.secret.update>> = [];

    if (keyChanged && nextKey) {
      const allVersions = await prisma.secretVersion.findMany({
        where: { secretId },
        orderBy: { createdAt: 'desc' },
      });
      for (const version of allVersions) {
        const plaintext = decryptSecretWithKey(
          { ciphertext: version.ciphertext, iv: version.iv, tag: version.tag },
          dek,
          secret.environmentId,
          secret.key,
        );
        const rewritten = encryptSecretWithKey(plaintext, dek, secret.environmentId, nextKey);
        transactionOps.push(
          prisma.secretVersion.update({
            where: { id: version.id },
            data: {
              ciphertext: rewritten.ciphertext,
              iv: rewritten.iv,
              tag: rewritten.tag,
            },
          }),
        );
      }
    }

    if (valueChanged && nextValue) {
      const payload = encryptSecretWithKey(nextValue, dek, secret.environmentId, finalKey);
      transactionOps.push(
        prisma.secretVersion.updateMany({
          where: { secretId },
          data: { isActive: false },
        }),
        prisma.secretVersion.create({
          data: {
            secretId,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            tag: payload.tag,
            keyVersion,
            createdBy: auth.user?.id,
            isActive: true,
          },
        }),
      );
    }

    transactionOps.push(
      prisma.secret.update({
        where: { id: secretId },
        data: {
          ...(keyChanged && nextKey ? { key: nextKey } : {}),
          updatedAt: new Date(),
          deletedAt: null,
        },
      }),
    );

    await prisma.$transaction(transactionOps);

    await logAudit({
      projectId: secret.environment.projectId,
      actorUserId: auth.user?.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'secret.update',
      resourceType: 'secret',
      resourceId: secretId,
      metadataJson: {
        previousKey: secret.key,
        updatedKey: finalKey,
        updatedValue: valueChanged,
      },
    });

    reply.send({ ok: true });
  });
}
