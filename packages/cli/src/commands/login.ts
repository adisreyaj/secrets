import { runLoginUI } from '../ui/login.js'
import { resolveBaseUrl, persistAuth } from '../core/context.js'
import { ApiError, CliError } from '../core/errors.js'
import type { CommandContext } from '../core/types.js'
import { outputSuccess } from '../core/output.js'
import { apiPublicRequest } from '../clients/api.js'
import { initCommand } from './init.js'

export async function loginCommand(ctx: CommandContext) {
  const baseUrl = await resolveBaseUrl(ctx.flags)
  try {
    const payload = await apiPublicRequest<{ code: string; loginUrl: string; expiresAt: string }>(
      baseUrl,
      '/auth/cli-login',
      { method: 'POST' },
      ctx.debug,
    )
    const result = await runLoginUI(baseUrl, payload)
    await persistAuth(result.token, baseUrl)
    outputSuccess(ctx.flags, { message: '\nLogin complete. Starting setup...', data: { tokenStored: true, baseUrl } })
    await initCommand(ctx)
  } catch (error) {
    if (error instanceof ApiError) {
      throw new CliError('AUTH_ERROR', `Unable to start CLI login (${error.status})`)
    }
    throw error
  }
}
