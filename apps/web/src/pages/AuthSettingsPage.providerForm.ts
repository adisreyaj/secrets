import type { AuthProviderDto } from '@secrets/shared'

export type ProviderFormState = {
  provider: 'google' | 'github'
  enabled: boolean
  clientId: string
  clientSecret: string
  scopes: string
}

export const defaultProviderFormState: ProviderFormState = {
  provider: 'google',
  enabled: true,
  clientId: '',
  clientSecret: '',
  scopes: 'openid,email,profile',
}

export const createProviderFormFromProvider = (
  provider: AuthProviderDto,
): ProviderFormState => ({
  provider: provider.provider,
  enabled: provider.enabled,
  clientId: provider.clientId,
  clientSecret: '',
  scopes: provider.scopes.join(','),
})

export const parseProviderScopes = (scopesInput: string) =>
  scopesInput
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
