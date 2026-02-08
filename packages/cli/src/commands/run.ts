import { spawn } from 'node:child_process'
import process from 'node:process'
import { loadClient } from '../core/context.js'
import { CliError } from '../core/errors.js'
import type { CommandContext } from '../core/types.js'

export async function runCommand(ctx: CommandContext, args: string[]) {
  const separatorIndex = args.indexOf('--')
  if (separatorIndex === -1) {
    throw new CliError('USAGE_ERROR', 'Expected -- before command to run')
  }

  const command = args.slice(separatorIndex + 1)
  if (command.length === 0) {
    throw new CliError('USAGE_ERROR', 'No command provided')
  }

  const { client } = await loadClient(ctx.flags)
  const secrets = await client.getSecrets()

  const env = { ...process.env }
  for (const [key, value] of Object.entries(secrets)) {
    if (!ctx.flags.override && typeof env[key] !== 'undefined') {
      continue
    }
    env[key] = value
  }

  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env,
  })

  child.on('exit', (code: number | null) => {
    process.exit(code ?? 0)
  })

  child.on('error', (error: Error) => {
    process.stderr.write(`Failed to run command: ${error.message}\n`)
    process.exit(1)
  })
}
