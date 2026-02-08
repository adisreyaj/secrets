import process from 'node:process'
import { loadClient } from '../core/context.js'
import { CliError } from '../core/errors.js'
import { outputSuccess } from '../core/output.js'
import type { CommandContext } from '../core/types.js'

export async function getCommand(ctx: CommandContext, key?: string) {
  if (!key) {
    throw new CliError('USAGE_ERROR', 'Secret key is required')
  }

  const { client } = await loadClient(ctx.flags)
  const value = await client.getSecret(key)
  if (typeof value === 'undefined') {
    throw new CliError('USAGE_ERROR', `Secret not found or value not available: ${key}`)
  }

  if (ctx.flags.json) {
    outputSuccess(ctx.flags, { data: { key, value } })
    return
  }

  process.stdout.write(`${value}\n`)
}
