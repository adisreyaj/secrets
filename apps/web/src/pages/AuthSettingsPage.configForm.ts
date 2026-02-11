export type AuthConfigFormState = {
  nativeAuthEnabled: boolean
  emailPasswordEnabled: boolean
  accessTokenTtlMinutes: string
  refreshTokenTtlDays: string
}

type AuthConfigSource = {
  nativeAuthEnabled: boolean
  emailPasswordEnabled: boolean
  accessTokenTtlMinutes: number
  refreshTokenTtlDays: number
}

export const mapAuthConfigToFormState = (
  config: AuthConfigSource,
): AuthConfigFormState => ({
  nativeAuthEnabled: config.nativeAuthEnabled,
  emailPasswordEnabled: config.emailPasswordEnabled,
  accessTokenTtlMinutes: String(config.accessTokenTtlMinutes),
  refreshTokenTtlDays: String(config.refreshTokenTtlDays),
})

export const parseAuthConfigTtl = (form: AuthConfigFormState) => {
  const accessTokenTtlMinutes = Number(form.accessTokenTtlMinutes)
  const refreshTokenTtlDays = Number(form.refreshTokenTtlDays)
  if (
    !Number.isFinite(accessTokenTtlMinutes) ||
    !Number.isFinite(refreshTokenTtlDays) ||
    accessTokenTtlMinutes < 1 ||
    refreshTokenTtlDays < 1
  ) {
    return null
  }

  return { accessTokenTtlMinutes, refreshTokenTtlDays }
}
