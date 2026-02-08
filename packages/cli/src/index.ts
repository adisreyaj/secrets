#!/usr/bin/env node
import process from 'node:process'
import { createDebugLogger } from './log.js'
import { parseFlags } from './core/flags.js'
import { fromError, CliError } from './core/errors.js'
import { outputError, printHelp } from './core/output.js'
import { assertNoUnexpectedArgs } from './core/prompts.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { initCommand } from './commands/init.js'
import { listCommand } from './commands/list.js'
import { getCommand } from './commands/get.js'
import { exportCommand } from './commands/export.js'
import { runCommand } from './commands/run.js'
import type { FlagOptions } from './core/types.js'

function debugEnabled(flags: FlagOptions) {
  return flags.debug === true || process.env.SECRETS_DEBUG === '1'
}

function extractGlobalFlags(args: string[]): FlagOptions {
  const has = (name: string) => args.some((arg) => arg === name || arg.startsWith(`${name}=`))
  return {
    debug: has('--debug'),
    json: has('--json'),
    yes: has('--yes'),
  }
}

async function dispatch(command: string, args: string[]) {
  if (command === 'run') {
    const separatorIndex = args.indexOf('--')
    const flagSlice = separatorIndex === -1 ? args : args.slice(0, separatorIndex)
    const { flags, rest } = parseFlags(flagSlice)
    if (rest.length > 0) {
      throw new CliError('USAGE_ERROR', 'Unexpected positional arguments before -- in run command')
    }

    const debug = createDebugLogger(debugEnabled(flags))
    await runCommand({ flags, debug }, args)
    return
  }

  const { flags, rest } = parseFlags(args)
  const debug = createDebugLogger(debugEnabled(flags))
  const ctx = { flags, debug }

  switch (command) {
    case 'login':
      assertNoUnexpectedArgs(rest, 'login')
      await loginCommand(ctx)
      return
    case 'logout':
      assertNoUnexpectedArgs(rest, 'logout')
      await logoutCommand(ctx)
      return
    case 'init':
      assertNoUnexpectedArgs(rest, 'init')
      await initCommand(ctx)
      return
    case 'list':
      assertNoUnexpectedArgs(rest, 'list')
      await listCommand(ctx)
      return
    case 'get':
      await getCommand(ctx, rest[0])
      return
    case 'export':
      assertNoUnexpectedArgs(rest, 'export')
      await exportCommand(ctx)
      return
    default:
      throw new CliError('USAGE_ERROR', `Unknown command: ${command}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  try {
    await dispatch(command, args.slice(1))
  } catch (error) {
    const flagsFromAll = extractGlobalFlags(args.slice(1))
    const normalized = fromError(error)
    outputError(flagsFromAll, normalized)
    if (!flagsFromAll.debug && process.env.SECRETS_DEBUG !== '1' && !flagsFromAll.json) {
      process.stderr.write('Tip: rerun with --debug or set SECRETS_DEBUG=1 for diagnostics.\n')
    }
    process.exit(normalized.exitCode)
  }
}

main()
