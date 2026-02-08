import fs from 'node:fs/promises'
import { AUTH_FILE } from '../core/context.js'
import { outputSuccess } from '../core/output.js'
import type { CommandContext } from '../core/types.js'

export async function logoutCommand(ctx: CommandContext) {
  try {
    await fs.unlink(AUTH_FILE)
    outputSuccess(ctx.flags, { message: 'Logged out. Local auth cache removed.', data: { removed: true } })
    return
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      outputSuccess(ctx.flags, { message: 'No local auth cache found. Already logged out.', data: { removed: false } })
      return
    }
    throw error
  }
}
