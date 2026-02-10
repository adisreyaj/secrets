import crypto from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  loadMasterKey,
  masterKeyVersion,
} from '../../../crypto.js';
import { prisma } from '../../../db.js';

type Jwk = {
  kty: string;
  e?: string;
  n?: string;
};

function encodeBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(params: {
  payload: Record<string, unknown>;
  privateKeyPem: string;
  kid: string;
}): string {
  const header = encodeBase64Url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: params.kid }),
  );
  const payload = encodeBase64Url(JSON.stringify(params.payload));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(params.privateKeyPem, 'base64url');

  return `${signingInput}.${signature}`;
}

export async function ensureActiveAuthSigningKey(projectId: string) {
  const existing = await prisma.authSigningKey.findFirst({
    where: {
      projectId,
      active: true,
      retiredAt: null,
    },
  });
  if (existing) {
    return existing;
  }

  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  const encrypted = encryptSecret(pair.privateKey, loadMasterKey());

  return prisma.authSigningKey.create({
    data: {
      projectId,
      kid: `ask_${crypto.randomUUID().replace(/-/g, '')}`,
      algorithm: 'RS256',
      publicKeyPem: pair.publicKey,
      privateKeyCiphertext: Buffer.from(encrypted.ciphertext),
      privateKeyIv: Buffer.from(encrypted.iv),
      privateKeyTag: Buffer.from(encrypted.tag),
      keyVersion: masterKeyVersion(),
      active: true,
    },
  });
}

export async function signProjectAccessToken(params: {
  projectId: string;
  endUserId: string;
  sessionId: string;
  expiresInMinutes: number;
}) {
  const key = await ensureActiveAuthSigningKey(params.projectId);
  const privateKey = decryptSecret(
    {
      ciphertext: Buffer.from(key.privateKeyCiphertext),
      iv: Buffer.from(key.privateKeyIv),
      tag: Buffer.from(key.privateKeyTag),
    },
    loadMasterKey(),
  );

  const now = Math.floor(Date.now() / 1000);
  const exp = now + params.expiresInMinutes * 60;
  const token = signJwt({
    privateKeyPem: privateKey,
    kid: key.kid,
    payload: {
      iss: 'secrets-runtime-auth',
      aud: params.projectId,
      sub: params.endUserId,
      sid: params.sessionId,
      iat: now,
      exp,
    },
  });

  return {
    token,
    expiresAt: new Date(exp * 1000),
    kid: key.kid,
  };
}

export async function buildProjectJwks(projectId: string) {
  const keys = await prisma.authSigningKey.findMany({
    where: {
      projectId,
      retiredAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    keys: keys
      .map((key) => {
        const exported = crypto
          .createPublicKey(key.publicKeyPem)
          .export({ format: 'jwk' }) as Jwk;
        if (!exported.n || !exported.e) {
          return null;
        }
        return {
          kty: exported.kty,
          use: 'sig',
          alg: key.algorithm,
          kid: key.kid,
          n: exported.n,
          e: exported.e,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  };
}
