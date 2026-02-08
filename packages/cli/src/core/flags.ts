import { CliError } from './errors.js'
import type { FlagOptions } from './types.js'

const BOOLEAN_FLAGS = new Set([
  '--override',
  '--dry-run',
  '--force',
  '--debug',
  '--yes',
  '--json',
])

const VALUE_FLAGS = new Set([
  '--env',
  '--project',
  '--base-url',
  '--format',
  '--out',
  '--project-name',
  '--env-name',
])

function assignFlag(flags: FlagOptions, key: string, value?: string) {
  switch (key) {
    case '--override':
      flags.override = true
      break
    case '--dry-run':
      flags.dryRun = true
      break
    case '--force':
      flags.force = true
      break
    case '--debug':
      flags.debug = true
      break
    case '--yes':
      flags.yes = true
      break
    case '--json':
      flags.json = true
      break
    case '--env':
      flags.env = value
      break
    case '--project':
      flags.project = value
      break
    case '--base-url':
      flags.baseUrl = value
      break
    case '--format':
      flags.format = value
      break
    case '--out':
      flags.out = value
      break
    case '--project-name':
      flags.projectName = value
      break
    case '--env-name':
      flags.envName = value
      break
    default:
      throw new CliError('USAGE_ERROR', `Unknown flag: ${key}`)
  }
}

export function parseFlags(args: string[]): { flags: FlagOptions; rest: string[] } {
  const flags: FlagOptions = {}
  const rest: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      rest.push(arg)
      continue
    }

    const [key, inlineValue] = arg.split('=')

    if (BOOLEAN_FLAGS.has(key)) {
      if (inlineValue !== undefined) {
        throw new CliError('USAGE_ERROR', `Flag does not accept value: ${key}`)
      }
      assignFlag(flags, key)
      continue
    }

    if (!VALUE_FLAGS.has(key)) {
      throw new CliError('USAGE_ERROR', `Unknown flag: ${key}`)
    }

    const value = inlineValue ?? args[i + 1]
    if (!value || (inlineValue === undefined && value.startsWith('--'))) {
      throw new CliError('USAGE_ERROR', `Missing value for ${key}`)
    }

    if (inlineValue === undefined) {
      i += 1
    }

    assignFlag(flags, key, value)
  }

  return { flags, rest }
}
