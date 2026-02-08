#!/usr/bin/env node
import { CONFIG_FILENAME, createClient, normalizeConfigInput, readConfigFile } from '@secrets/sdk';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseEnvFile, summarizeImportResults } from './env.js';
import { runLoginUI } from './ui/login.js';
import { promptConfirm, promptSelect, promptText } from './ui/shared.js';

const DEFAULT_BASE_URL = 'http://localhost:3001';
const AUTH_DIR = path.join(os.homedir(), '.config', 'secrets');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');

type StoredAuth = {
  token: string;
  baseUrl: string;
  updatedAt: string;
};

type FlagOptions = {
  env?: string;
  project?: string;
  baseUrl?: string;
  format?: string;
  out?: string;
  override?: boolean;
  dryRun?: boolean;
  force?: boolean;
  debug?: boolean;
  projectName?: string;
  envName?: string;
};

function printHelp() {
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
    '  --dry-run             Show export output details without writing (export only)',
    '  --force               Overwrite existing files (export/init)',
    '  --project-name <value>  Project name (init only)',
    '  --env-name <value>      Environment name (init only)',
    '  --debug               Enable verbose diagnostic logs (stderr)',
    '',
  ];

  console.log(lines.join('\n'));
}

function parseFlags(args: string[]): { flags: FlagOptions; rest: string[] } {
  const flags: FlagOptions = {};
  const rest: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }

    if (arg === '--override') {
      flags.override = true;
      continue;
    }
    if (arg === '--dry-run') {
      flags.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      flags.force = true;
      continue;
    }
    if (arg === '--debug') {
      flags.debug = true;
      continue;
    }

    const [key, inlineValue] = arg.split('=');
    const value = inlineValue ?? args[i + 1];
    if (!value || (inlineValue === undefined && value.startsWith('--'))) {
      throw new Error(`Missing value for ${key}`);
    }
    if (inlineValue === undefined) {
      i += 1;
    }

    switch (key) {
      case '--env':
        flags.env = value;
        break;
      case '--project':
        flags.project = value;
        break;
      case '--base-url':
        flags.baseUrl = value;
        break;
      case '--format':
        flags.format = value;
        break;
      case '--out':
        flags.out = value;
        break;
      case '--project-name':
        flags.projectName = value;
        break;
      case '--env-name':
        flags.envName = value;
        break;
      default:
        throw new Error(`Unknown flag: ${key}`);
    }
  }

  return { flags, rest };
}

async function loadClient(flags: FlagOptions) {
  const config = await readConfigFile();
  const storedAuth = await readStoredAuth();
  const token = process.env.SECRETS_TOKEN ?? storedAuth?.token;
  if (!token) {
    throw new Error('Missing SECRETS_TOKEN. Run `secrets login` or set the env var.');
  }

  const baseUrl =
    flags.baseUrl ??
    process.env.SECRETS_API_BASE_URL ??
    config?.apiBaseUrl ??
    storedAuth?.baseUrl ??
    DEFAULT_BASE_URL;

  const envInput = flags.env ?? process.env.SECRETS_ENV;
  const projectInput = flags.project ?? process.env.SECRETS_PROJECT;

  const envSelection = normalizeConfigInput(
    envInput,
    config?.environmentId ?? config?.environmentSlug,
  );
  const projectSelection = normalizeConfigInput(
    projectInput,
    config?.projectId ?? config?.projectSlug,
  );

  if (!envSelection.id && !envSelection.slug) {
    throw new Error(
      'Missing SECRETS_ENV (or environment in config). Run `secrets init` or set SECRETS_ENV.',
    );
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
  };
}

async function apiFetch<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as T;
}

async function apiRequest<T>(
  baseUrl: string,
  token: string,
  path: string,
  options: RequestInit,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as T;
}

async function resolveBaseUrl(flags: FlagOptions) {
  const config = await readConfigFile();
  const storedAuth = await readStoredAuth();
  return (
    flags.baseUrl ??
    process.env.SECRETS_API_BASE_URL ??
    config?.apiBaseUrl ??
    storedAuth?.baseUrl ??
    DEFAULT_BASE_URL
  );
}

async function readStoredAuth(): Promise<StoredAuth | null> {
  try {
    const raw = await fs.readFile(AUTH_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed.token || !parsed.baseUrl) {
      return null;
    }
    return parsed;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    return null;
  }
}

async function persistAuth(token: string, baseUrl: string) {
  await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    AUTH_FILE,
    JSON.stringify(
      {
        token,
        baseUrl,
        updatedAt: new Date().toISOString(),
      } satisfies StoredAuth,
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

async function runInitFlow(flags: FlagOptions, tokenOverride?: string) {
  const token = tokenOverride ?? process.env.SECRETS_TOKEN;
  if (!token) {
    throw new Error('Missing SECRETS_TOKEN. Run `secrets login` first.');
  }

  const baseUrl = await resolveBaseUrl(flags);
  const configPath = path.join(process.cwd(), CONFIG_FILENAME);

  try {
    await fs.access(configPath);
    if (!flags.force) {
      throw new Error(`Config file already exists at ${configPath}. Use --force to overwrite.`);
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code && err.code !== 'ENOENT') {
      throw error;
    }
  }

  const cwdName = path.basename(process.cwd());
  const envPath = path.join(process.cwd(), '.env');
  let envExists = false;
  try {
    await fs.access(envPath);
    envExists = true;
  } catch {
    envExists = false;
  }

  const projects = await apiFetch<{ id: string; name: string; slug?: string | null }[]>(
    baseUrl,
    token,
    '/projects',
  );
  let project: { id: string; slug?: string | null };
  if (projects.length > 0) {
    const options = [
      ...projects.map((item) => (item.slug ? `${item.name} (${item.slug})` : item.name)),
      '+ Create new project',
    ];
    const selected = await promptSelect('Select a project', options);
    if (selected === options.length - 1) {
      const projectName = await promptText('Project name', flags.projectName ?? cwdName);
      project = await apiRequest<{ id: string; slug?: string | null }>(
        baseUrl,
        token,
        `/projects`,
        {
          method: 'POST',
          body: JSON.stringify({ name: projectName }),
        },
      );
    } else {
      project = { id: projects[selected]!.id, slug: projects[selected]!.slug };
    }
  } else {
    const projectName = await promptText('Project name', flags.projectName ?? cwdName);
    project = await apiRequest<{ id: string; slug?: string | null }>(baseUrl, token, `/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: projectName }),
    });
  }

  const environments = await apiFetch<{ id: string; name: string; slug?: string | null }[]>(
    baseUrl,
    token,
    `/projects/${project.id}/environments`,
  );
  let environment: { id: string; slug?: string | null };
  if (environments.length > 0) {
    const options = [
      ...environments.map((item) => (item.slug ? `${item.name} (${item.slug})` : item.name)),
      '+ Create new environment',
    ];
    const selected = await promptSelect('Select an environment', options);
    if (selected === options.length - 1) {
      const envName = await promptText('Environment name', flags.envName ?? 'dev');
      environment = await apiRequest<{ id: string; slug?: string | null }>(
        baseUrl,
        token,
        `/projects/${project.id}/environments`,
        {
          method: 'POST',
          body: JSON.stringify({ name: envName }),
        },
      );
    } else {
      environment = { id: environments[selected]!.id, slug: environments[selected]!.slug };
    }
  } else {
    const envName = await promptText('Environment name', flags.envName ?? 'dev');
    environment = await apiRequest<{ id: string; slug?: string | null }>(
      baseUrl,
      token,
      `/projects/${project.id}/environments`,
      {
        method: 'POST',
        body: JSON.stringify({ name: envName }),
      },
    );
  }

  const config = {
    apiBaseUrl: baseUrl,
    projectId: project.id,
    environmentId: environment.id,
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_FILENAME}`);

  if (envExists) {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let gitignore = '';
    try {
      gitignore = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      gitignore = '';
    }
    const hasEnvIgnore = gitignore.split(/\r?\n/).some((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      if (trimmed.startsWith('!')) return false;
      return (
        /^\.env$/.test(trimmed) ||
        /^\.env\/$/.test(trimmed) ||
        /^\.env\*$/.test(trimmed) ||
        /^\.env\..+/.test(trimmed) ||
        /^(?:\*\/|\*\*\/)\.env(\..+)?$/.test(trimmed) ||
        /^(?:\*\/|\*\*\/)\.env\*$/.test(trimmed)
      );
    });
    if (!hasEnvIgnore) {
      console.warn('Warning: .env is not ignored in .gitignore (add .env, .env.*, or **/.env*).');
    }

    const importEnv = await promptConfirm('Import .env into secrets?', true);
    if (importEnv) {
      const raw = await fs.readFile(envPath, 'utf-8');
      const entries = parseEnvFile(raw);
      const results: { status?: string }[] = [];
      for (const entry of entries) {
        const result = await apiRequest<{ status?: string }>(
          baseUrl,
          token,
          `/environments/${environment.id}/secrets`,
          {
            method: 'POST',
            body: JSON.stringify(entry),
          },
        );
        results.push(result ?? {});
      }
      const { created, pending } = summarizeImportResults(results);
      if (pending > 0) {
        console.log(`Imported ${created} secrets from .env (pending approval: ${pending})`);
      } else {
        console.log(`Imported ${created} secrets from .env`);
      }
    }
  } else {
    console.log('No .env found in current directory.');
  }
}

async function loginCommand(args: string[]) {
  const { flags, rest } = parseFlags(args);
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for login command');
  }

  const baseUrl = await resolveBaseUrl(flags);
  const response = await fetch(`${baseUrl}/auth/cli-login`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Unable to start CLI login (${response.status})`);
  }
  const payload = (await response.json()) as { code: string; loginUrl: string; expiresAt: string };

  const result = await runLoginUI(baseUrl, payload);
  await persistAuth(result.token, baseUrl);
  console.log('\nLogin complete. Starting setup...');
  await runInitFlow(flags, result.token);
}

async function initCommand(args: string[]) {
  const { flags, rest } = parseFlags(args);
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for init command');
  }
  const storedAuth = await readStoredAuth();
  const token = process.env.SECRETS_TOKEN ?? storedAuth?.token;
  if (!token) {
    throw new Error('Missing SECRETS_TOKEN. Run `secrets login` first.');
  }
  await runInitFlow(flags, token);
}

async function logoutCommand(args: string[]) {
  const { rest } = parseFlags(args);
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for logout command');
  }

  try {
    await fs.unlink(AUTH_FILE);
    console.log('Logged out. Local auth cache removed.');
    return;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log('No local auth cache found. Already logged out.');
      return;
    }
    throw error;
  }
}

async function runCommand(args: string[]) {
  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1) {
    throw new Error('Expected -- before command to run');
  }

  const { flags } = parseFlags(args.slice(0, separatorIndex));
  const command = args.slice(separatorIndex + 1);
  if (command.length === 0) {
    throw new Error('No command provided');
  }

  const { client } = await loadClient(flags);
  const secrets = await client.getSecrets();

  const env = { ...process.env };
  for (const [key, value] of Object.entries(secrets)) {
    if (!flags.override && typeof env[key] !== 'undefined') {
      continue;
    }
    env[key] = value;
  }

  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code: number | null) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error: Error) => {
    console.error(`Failed to run command: ${error.message}`);
    process.exit(1);
  });
}

async function exportEnv(args: string[]) {
  const { flags, rest } = parseFlags(args);
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for export command');
  }
  if (flags.format && flags.format !== 'dotenv') {
    throw new Error('Only dotenv format is supported');
  }

  const { client, baseUrl, token } = await loadClient(flags);
  const envId = await client.resolveEnvironmentId();
  const output = await apiFetch<string>(
    baseUrl,
    token,
    `/environments/${envId}/export?format=dotenv`,
  );

  if (flags.out) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const resolved = path.resolve(flags.out);
    if (!flags.force) {
      try {
        await fs.access(resolved);
        throw new Error(`Output file exists: ${resolved}. Use --force to overwrite.`);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code && err.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    if (flags.dryRun) {
      console.log(`Dry run: would write ${output.length} bytes to ${resolved}`);
      return;
    }
    await fs.writeFile(resolved, output, 'utf-8');
    return;
  }

  if (flags.dryRun) {
    console.log(`Dry run: would print ${output.length} bytes to stdout`);
    return;
  }
  process.stdout.write(output);
}

async function listSecrets(args: string[]) {
  const { flags, rest } = parseFlags(args);
  if (rest.length > 0) {
    throw new Error('Unexpected arguments for list command');
  }

  const { client, baseUrl, token } = await loadClient(flags);
  const envId = await client.resolveEnvironmentId();
  const secrets = await apiFetch<{ key: string; value?: string }[]>(
    baseUrl,
    token,
    `/environments/${envId}/secrets?includeValues=true`,
  );

  for (const secret of secrets) {
    console.log(secret.key);
  }
}

async function getSecret(args: string[]) {
  const { flags, rest } = parseFlags(args);
  const key = rest[0];
  if (!key) {
    throw new Error('Secret key is required');
  }

  const { client } = await loadClient(flags);
  const value = await client.getSecret(key);
  if (typeof value === 'undefined') {
    throw new Error(`Secret not found or value not available: ${key}`);
  }
  process.stdout.write(`${value}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'run':
      await runCommand(args.slice(1));
      break;
    case 'export':
      await exportEnv(args.slice(1));
      break;
    case 'login':
      await loginCommand(args.slice(1));
      break;
    case 'logout':
      await logoutCommand(args.slice(1));
      break;
    case 'init':
      await initCommand(args.slice(1));
      break;
    case 'list':
      await listSecrets(args.slice(1));
      break;
    case 'get':
      await getSecret(args.slice(1));
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
