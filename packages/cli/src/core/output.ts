import process from 'node:process'
import type { FlagOptions } from './types.js'
import type { CliError } from './errors.js'

type SuccessPayload = {
  data?: unknown
  warnings?: string[]
  next?: string[]
  message?: string
}

export function printHelp() {
  const lines = [
    '',
    'Secrets CLI',
    '',
    'Usage:',
    '  secrets run -- <command>',
    '  secrets export [--format dotenv] [--out <file>]',
    '  secrets login',
    '  secrets logout',
    '  secrets init',
    '  secrets list',
    '  secrets get <key>',
    '',
    'Global flags:',
    '  --json                Print structured JSON output',
    '  --yes                 Non-interactive mode for setup prompts',
    '  --debug               Enable verbose diagnostic logs (stderr)',
    '',
    'Environment variables:',
    '  SECRETS_TOKEN         API token',
    '  SECRETS_ENV           Environment id or slug',
    '  SECRETS_PROJECT       Project id or slug (required when env is slug)',
    '  SECRETS_API_BASE_URL  API base URL',
    '',
  ]

  console.log(lines.join('\n'))
}

export function outputSuccess(flags: FlagOptions, payload: SuccessPayload) {
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, data: payload.data ?? null, warnings: payload.warnings ?? [], next: payload.next ?? [] })}\n`,
    )
    return
  }

  if (payload.message) {
    console.log(payload.message)
  }

  if (payload.warnings && payload.warnings.length > 0) {
    for (const warning of payload.warnings) {
      console.warn(`Warning: ${warning}`)
    }
  }

  if (payload.next && payload.next.length > 0) {
    for (const line of payload.next) {
      console.log(line)
    }
  }
}

export function outputError(flags: FlagOptions, error: CliError) {
  if (flags.json) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: { code: error.code, message: error.message, hint: error.hint ?? null } })}\n`,
    )
    return
  }

  process.stderr.write(`${error.message}\n`)
  if (error.hint) {
    process.stderr.write(`Hint: ${error.hint}\n`)
  }
}
