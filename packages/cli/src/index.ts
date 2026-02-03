#!/usr/bin/env node
import { spawn } from 'node:child_process'
import process from 'node:process'
import {
  CONFIG_FILENAME,
  createClient,
  normalizeConfigInput,
  readConfigFile,
} from '@secrets/sdk'

const DEFAULT_BASE_URL = 'http://localhost:3001'

type FlagOptions = {
  env?: string
  project?: string
  baseUrl?: string
  format?: string
  out?: string
  override?: boolean
}

function printHelp() {
  const lines = [
    '',
    'Secrets CLI',
    '',
    'Usage:',
    '  secrets run -- <command>',
    '  secrets export [--format dotenv] [--out <file>]',
    '  secrets list',
    '  secrets get <key>',
    '',
    'Environment variables:',
    '  SECRETS_TOKEN     API token (required)',
    '  SECRETS_ENV       Environment id or slug (required)',
    '  SECRETS_PROJECT   Project id or slug (required when env is a slug)',
    '  SECRETS_API_BASE_URL  API base URL (optional)',
    '',
    'Optional config file:',
    `  ${CONFIG_FILENAME}`,
    '',
    'Flags:',
    '  --env <value>         Environment id or slug',
    '  --project <value>     Project id or slug',
    '  --base-url <value>    API base URL',
    '  --override            Override existing env vars (run only)',
    '  --format dotenv       Export format (export only)',
    '  --out <file>          Write export to file (export only)',
    '',
  ]

  console.log(lines.join('\n'))
}

function parseFlags(args: string[]): { flags: FlagOptions; rest: string[] } {
  const flags: FlagOptions = {}
  const rest: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      rest.push(arg)
      continue
    }

    if (arg === '--override') {
      flags.override = true
      continue
    }

    const [key, inlineValue] = arg.split('=')
    const value = inlineValue ?? args[i + 1]
    if (!value || (inlineValue === undefined && value.startsWith('--'))) {
      throw new Error(`Missing value for ${key}`)
    }
    if (inlineValue === undefined) {
      i += 1
    }

    switch (key) {
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
      default:
        throw new Error(`Unknown flag: ${key}`)
    }
  }

  return { flags, rest }
}

async function loadClient(flags: FlagOptions) {
  const config = await readConfigFile()
  const token = process.env.SECRETS_TOKEN
  if (!token) {
    throw new Error('Missing SECRETS_TOKEN')
  }

  const baseUrl =
    flags.baseUrl ?? process.env.SECRETS_API_BASE_URL ?? config?.apiBaseUrl ?? DEFAULT_BASE_URL

  const envInput = flags.env ?? process.env.SECRETS_ENV
  const projectInput = flags.project ?? process.env.SECRETS_PROJECT

  const envSelection = normalizeConfigInput(
    envInput,
    config?.environmentId ?? config?.environmentSlug,
  )
  const projectSelection = normalizeConfigInput(
    projectInput,
    config?.projectId ?? config?.projectSlug,
  )

  if (!envSelection.id && !envSelection.slug) {
    throw new Error('Missing SECRETS_ENV (or environment in config)')
  }

  return {
    client: createClient({
      baseUrl,
      token,
      environmentId: envSelection.id,
      environmentSlug: envSelection.slug,
      projectId: projectSelection.id,
      projectSlug: projectSelection.slug,
    }),
    baseUrl,
    token,
  }
}

async function apiFetch<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const payload = await response.json()
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}

async function runCommand(args: string[]) {
  const separatorIndex = args.indexOf('--')
  if (separatorIndex === -1) {
    throw new Error('Expected -- before command to run')
  }

  const { flags } = parseFlags(args.slice(0, separatorIndex))
  const command = args.slice(separatorIndex + 1)
  if (command.length === 0) {
    throw new Error('No command provided')
  }

  const { client } = await loadClient(flags)
  const secrets = await client.getSecrets()

  const env = { ...process.env }
  for (const [key, value] of Object.entries(secrets)) {
    if (!flags.override && typeof env[key] !== 'undefined') {
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
    console.error(`Failed to run command: ${error.message}`)
    process.exit(1)
  })
}

async function exportEnv(args: string[]) {
  const { flags, rest } = parseFlags(args)
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for export command')
  }
  if (flags.format && flags.format !== 'dotenv') {
    throw new Error('Only dotenv format is supported')
  }

  const { client, baseUrl, token } = await loadClient(flags)
  const envId = await client.resolveEnvironmentId()
  const output = await apiFetch<string>(baseUrl, token, `/environments/${envId}/export?format=dotenv`)

  if (flags.out) {
    await import('node:fs/promises').then((fs) => fs.writeFile(flags.out!, output, 'utf-8'))
    return
  }

  process.stdout.write(output)
}

async function listSecrets(args: string[]) {
  const { flags, rest } = parseFlags(args)
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for list command')
  }

  const { client, baseUrl, token } = await loadClient(flags)
  const envId = await client.resolveEnvironmentId()
  const secrets = await apiFetch<{ key: string; value?: string }[]>(
    baseUrl,
    token,
    `/environments/${envId}/secrets?includeValues=true`,
  )

  for (const secret of secrets) {
    console.log(secret.key)
  }
}

async function getSecret(args: string[]) {
  const { flags, rest } = parseFlags(args)
  const key = rest[0]
  if (!key) {
    throw new Error('Secret key is required')
  }

  const { client } = await loadClient(flags)
  const value = await client.getSecret(key)
  if (typeof value === 'undefined') {
    throw new Error(`Secret not found or value not available: ${key}`)
  }
  process.stdout.write(`${value}\n`)
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  switch (command) {
    case 'run':
      await runCommand(args.slice(1))
      break
    case 'export':
      await exportEnv(args.slice(1))
      break
    case 'list':
      await listSecrets(args.slice(1))
      break
    case 'get':
      await getSecret(args.slice(1))
      break
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
