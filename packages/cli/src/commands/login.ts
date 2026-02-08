import { runLoginUI } from '../ui/login.js'
import { resolveBaseUrl, persistAuth } from '../core/context.js'
import { CliError } from '../core/errors.js'
import type { CommandContext } from '../core/types.js'
import { outputSuccess } from '../core/output.js'
import { initCommand } from './init.js'

export async function loginCommand(ctx: CommandContext) {
  const baseUrl = await resolveBaseUrl(ctx.flags)
  const url = `${baseUrl}/auth/cli-login`
  ctx.debug('http.request', { method: 'POST', url })

  let response: Response
  try {
    response = await fetch(url, { method: 'POST' })
  } catch (error) {
    ctx.debug('http.network_error', { method: 'POST', url, error: error instanceof Error ? error.message : String(error) })
    throw new CliError('NETWORK_ERROR', 'fetch failed')
  }

  if (!response.ok) {
    throw new CliError('AUTH_ERROR', `Unable to start CLI login (${response.status})`)
  }
  const payload = (await response.json()) as { code: string; loginUrl: string; expiresAt: string }

  const result = await runLoginUI(baseUrl, payload)
  await persistAuth(result.token, baseUrl)
  outputSuccess(ctx.flags, { message: '\nLogin complete. Starting setup...', data: { tokenStored: true, baseUrl } })
  await initCommand(ctx)
}
