import { and, eq } from 'drizzle-orm';
import {
  aadForGeneric,
  decryptSecret,
  encryptSecret,
  loadMasterKey,
  masterKeyVersion,
} from '../../../crypto.js';
import {
  AuthIdentityProvider,
  authProviderConfigs,
  db,
  type AuthIdentityProvider as AuthIdentityProviderType,
} from '../../../db/index.js';

function aadForProviderConfigKey(
  projectId: string,
  provider: AuthIdentityProviderType,
): string {
  return aadForGeneric({ provider, projectId, scope: 'auth_provider_config' });
}

export async function upsertAuthProviderConfig(params: {
  projectId: string;
  provider: AuthIdentityProviderType;
  clientId: string;
  clientSecret: string;
  enabled?: boolean;
  scopes?: string[];
}) {
  const masterKey = loadMasterKey();
  const aad = aadForProviderConfigKey(params.projectId, params.provider);
  const encrypted = encryptSecret(params.clientSecret, masterKey, aad);

  const values = {
    projectId: params.projectId,
    provider: params.provider,
    enabled: params.enabled ?? true,
    clientId: params.clientId,
    clientSecretCiphertext: Buffer.from(encrypted.ciphertext),
    clientSecretIv: Buffer.from(encrypted.iv),
    clientSecretTag: Buffer.from(encrypted.tag),
    keyVersion: masterKeyVersion(),
    scopesJson: params.scopes ?? [],
  };

  const [row] = await db
    .insert(authProviderConfigs)
    .values(values)
    .onConflictDoUpdate({
      target: [authProviderConfigs.projectId, authProviderConfigs.provider],
      set: {
        enabled: params.enabled ?? true,
        clientId: params.clientId,
        clientSecretCiphertext: values.clientSecretCiphertext,
        clientSecretIv: values.clientSecretIv,
        clientSecretTag: values.clientSecretTag,
        keyVersion: values.keyVersion,
        scopesJson: params.scopes ?? undefined,
      },
    })
    .returning();

  return row;
}

export async function rotateAuthProviderSecret(params: {
  projectId: string;
  provider: AuthIdentityProviderType;
  clientSecret: string;
}) {
  const masterKey = loadMasterKey();
  const aad = aadForProviderConfigKey(params.projectId, params.provider);
  const encrypted = encryptSecret(params.clientSecret, masterKey, aad);
  const [row] = await db
    .update(authProviderConfigs)
    .set({
      clientSecretCiphertext: Buffer.from(encrypted.ciphertext),
      clientSecretIv: Buffer.from(encrypted.iv),
      clientSecretTag: Buffer.from(encrypted.tag),
      keyVersion: masterKeyVersion(),
    })
    .where(
      and(
        eq(authProviderConfigs.projectId, params.projectId),
        eq(authProviderConfigs.provider, params.provider),
      ),
    )
    .returning();
  return row;
}

export function decryptProviderSecret(config: {
  projectId: string;
  provider: AuthIdentityProviderType;
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
    aadForProviderConfigKey(config.projectId, config.provider),
  );
}

export { AuthIdentityProvider };
