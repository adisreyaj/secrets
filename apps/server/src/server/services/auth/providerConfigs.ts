import { AuthIdentityProvider } from '@prisma/client';
import { decryptSecret, encryptSecret, loadMasterKey, masterKeyVersion } from '../../../crypto.js';
import { prisma } from '../../../db.js';

export async function upsertAuthProviderConfig(params: {
  projectId: string;
  provider: AuthIdentityProvider;
  clientId: string;
  clientSecret: string;
  enabled?: boolean;
  scopes?: string[];
}) {
  const encrypted = encryptSecret(params.clientSecret, loadMasterKey());

  return prisma.authProviderConfig.upsert({
    where: {
      projectId_provider: {
        projectId: params.projectId,
        provider: params.provider,
      },
    },
    create: {
      projectId: params.projectId,
      provider: params.provider,
      enabled: params.enabled ?? true,
      clientId: params.clientId,
      clientSecretCiphertext: Buffer.from(encrypted.ciphertext),
      clientSecretIv: Buffer.from(encrypted.iv),
      clientSecretTag: Buffer.from(encrypted.tag),
      keyVersion: masterKeyVersion(),
      scopesJson: params.scopes ?? [],
    },
    update: {
      enabled: params.enabled ?? undefined,
      clientId: params.clientId,
      clientSecretCiphertext: Buffer.from(encrypted.ciphertext),
      clientSecretIv: Buffer.from(encrypted.iv),
      clientSecretTag: Buffer.from(encrypted.tag),
      keyVersion: masterKeyVersion(),
      scopesJson: params.scopes ?? undefined,
    },
  });
}

export async function rotateAuthProviderSecret(params: {
  projectId: string;
  provider: AuthIdentityProvider;
  clientSecret: string;
}) {
  const encrypted = encryptSecret(params.clientSecret, loadMasterKey());
  return prisma.authProviderConfig.update({
    where: {
      projectId_provider: {
        projectId: params.projectId,
        provider: params.provider,
      },
    },
    data: {
      clientSecretCiphertext: Buffer.from(encrypted.ciphertext),
      clientSecretIv: Buffer.from(encrypted.iv),
      clientSecretTag: Buffer.from(encrypted.tag),
      keyVersion: masterKeyVersion(),
    },
  });
}

export function decryptProviderSecret(config: {
  clientSecretCiphertext: Buffer | Uint8Array;
  clientSecretIv: Buffer | Uint8Array;
  clientSecretTag: Buffer | Uint8Array;
}): string {
  return decryptSecret(
    {
      ciphertext: config.clientSecretCiphertext,
      iv: config.clientSecretIv,
      tag: config.clientSecretTag,
    },
    loadMasterKey(),
  );
}
