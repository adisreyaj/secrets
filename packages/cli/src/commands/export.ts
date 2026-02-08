import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { loadClient } from '../core/context.js'
import { CliError } from '../core/errors.js'
import { outputSuccess } from '../core/output.js'
import type { CommandContext } from '../core/types.js'
import { apiFetch } from '../clients/api.js'

export async function exportCommand(ctx: CommandContext) {
  if (ctx.flags.format && ctx.flags.format !== 'dotenv') {
    throw new CliError('USAGE_ERROR', 'Only dotenv format is supported')
  }

  const { client, baseUrl, token } = await loadClient(ctx.flags)
  const envId = await client.resolveEnvironmentId()
  const output = await apiFetch<string>(
    baseUrl,
    token,
    `/environments/${envId}/export?format=dotenv`,
    ctx.debug,
  )

  if (ctx.flags.out) {
    const resolved = path.resolve(ctx.flags.out)
    if (!ctx.flags.force) {
      try {
        await fs.access(resolved)
        throw new CliError('CONFLICT', `Output file exists: ${resolved}. Use --force to overwrite.`)
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code && err.code !== 'ENOENT') {
          throw error
        }
      }
    }
    if (ctx.flags.dryRun) {
      outputSuccess(ctx.flags, {
        message: `Dry run: would write ${output.length} bytes to ${resolved}`,
        data: { dryRun: true, bytes: output.length, out: resolved },
      })
      return
    }
    await fs.writeFile(resolved, output, 'utf-8')
    outputSuccess(ctx.flags, {
      message: `Wrote dotenv export to ${resolved}`,
      data: { out: resolved, bytes: output.length },
    })
    return
  }

  if (ctx.flags.dryRun) {
    outputSuccess(ctx.flags, {
      message: `Dry run: would print ${output.length} bytes to stdout`,
      data: { dryRun: true, bytes: output.length },
    })
    return
  }

  process.stdout.write(output)
}
