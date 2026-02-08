import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseEnvFile, summarizeImportResults } from '../env.js'
import { loadClient, readStoredAuth, resolveBaseUrl, CONFIG_FILENAME } from '../core/context.js'
import { CliError } from '../core/errors.js'
import { askConfirm, askText, chooseIndex } from '../core/prompts.js'
import { outputSuccess } from '../core/output.js'
import type { CommandContext } from '../core/types.js'
import { apiFetch, apiRequest, createEnvironment } from '../clients/api.js'

function hasFlagSelections(ctx: CommandContext) {
  return Boolean(ctx.flags.project || ctx.flags.projectName || ctx.flags.env || ctx.flags.envName)
}

export async function initCommand(ctx: CommandContext) {
  if (ctx.flags.yes && !hasFlagSelections(ctx)) {
    throw new CliError(
      'USAGE_ERROR',
      'Non-interactive mode requires at least one selector (--project/--project-name/--env/--env-name).',
    )
  }

  const storedAuth = await readStoredAuth()
  const token = process.env.SECRETS_TOKEN ?? storedAuth?.token
  if (!token) {
    throw new CliError('AUTH_ERROR', 'Missing SECRETS_TOKEN. Run `secrets login` first.')
  }

  const baseUrl = await resolveBaseUrl(ctx.flags)
  const configPath = path.join(process.cwd(), CONFIG_FILENAME)

  try {
    await fs.access(configPath)
    if (!ctx.flags.force) {
      throw new CliError('CONFLICT', `Config file already exists at ${configPath}. Use --force to overwrite.`)
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code && err.code !== 'ENOENT') {
      throw error
    }
  }

  const cwdName = path.basename(process.cwd())
  const envPath = path.join(process.cwd(), '.env')
  const envExists = await fs
    .access(envPath)
    .then(() => true)
    .catch(() => false)

  const projects = await apiFetch<{ id: string; name: string; slug?: string | null }[]>(
    baseUrl,
    token,
    '/projects',
    ctx.debug,
  )

  let project: { id: string; slug?: string | null }
  if (ctx.flags.project) {
    const byIdOrSlug = projects.find((p) => p.id === ctx.flags.project || p.slug === ctx.flags.project)
    if (!byIdOrSlug) {
      throw new CliError('USAGE_ERROR', `Project not found: ${ctx.flags.project}`)
    }
    project = { id: byIdOrSlug.id, slug: byIdOrSlug.slug }
  } else if (projects.length > 0) {
    const options = [
      ...projects.map((item) => (item.slug ? `${item.name} (${item.slug})` : item.name)),
      '+ Create new project',
    ]
    const selected = await chooseIndex(ctx.flags, 'Select a project', options)
    if (selected === options.length - 1) {
      const projectName = await askText(ctx.flags, 'Project name', ctx.flags.projectName ?? cwdName)
      project = await apiRequest<{ id: string; slug?: string | null }>(
        baseUrl,
        token,
        '/projects',
        {
          method: 'POST',
          body: JSON.stringify({ name: projectName }),
        },
        ctx.debug,
      )
    } else {
      project = { id: projects[selected]!.id, slug: projects[selected]!.slug }
    }
  } else {
    const projectName = await askText(ctx.flags, 'Project name', ctx.flags.projectName ?? cwdName)
    project = await apiRequest<{ id: string; slug?: string | null }>(
      baseUrl,
      token,
      '/projects',
      {
        method: 'POST',
        body: JSON.stringify({ name: projectName }),
      },
      ctx.debug,
    )
  }

  const environments = await apiFetch<{ id: string; name: string; slug?: string | null }[]>(
    baseUrl,
    token,
    `/projects/${project.id}/environments`,
    ctx.debug,
  )

  let environment: { id: string; slug?: string | null }
  if (ctx.flags.env) {
    const byIdOrSlug = environments.find((e) => e.id === ctx.flags.env || e.slug === ctx.flags.env)
    if (!byIdOrSlug) {
      throw new CliError('USAGE_ERROR', `Environment not found in selected project: ${ctx.flags.env}`)
    }
    environment = { id: byIdOrSlug.id, slug: byIdOrSlug.slug }
  } else if (environments.length > 0) {
    const options = [
      ...environments.map((item) => (item.slug ? `${item.name} (${item.slug})` : item.name)),
      '+ Create new environment',
    ]
    const selected = await chooseIndex(ctx.flags, 'Select an environment', options)
    if (selected === options.length - 1) {
      const envName = await askText(ctx.flags, 'Environment name', ctx.flags.envName ?? 'dev')
      environment = await createEnvironment(baseUrl, token, project.id, envName, ctx.debug)
    } else {
      environment = { id: environments[selected]!.id, slug: environments[selected]!.slug }
    }
  } else {
    const envName = await askText(ctx.flags, 'Environment name', ctx.flags.envName ?? 'dev')
    environment = await createEnvironment(baseUrl, token, project.id, envName, ctx.debug)
  }

  const config = {
    apiBaseUrl: baseUrl,
    projectId: project.id,
    environmentId: environment.id,
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2))

  const warnings: string[] = []
  if (envExists) {
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    const gitignore = await fs.readFile(gitignorePath, 'utf-8').catch(() => '')
    const hasEnvIgnore = gitignore.split(/\r?\n/).some((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return false
      return (
        /^\.env$/.test(trimmed) ||
        /^\.env\/$/.test(trimmed) ||
        /^\.env\*$/.test(trimmed) ||
        /^\.env\..+/.test(trimmed) ||
        /^(?:\*\/|\*\*\/)\.env(\..+)?$/.test(trimmed) ||
        /^(?:\*\/|\*\*\/)\.env\*$/.test(trimmed)
      )
    })
    if (!hasEnvIgnore) {
      warnings.push('.env is not ignored in .gitignore (add .env, .env.*, or **/.env*).')
    }

    const shouldImport = await askConfirm(ctx.flags, 'Import .env into secrets?', true)
    if (shouldImport) {
      const raw = await fs.readFile(envPath, 'utf-8')
      const entries = parseEnvFile(raw)
      const results: { status?: string }[] = []
      for (const entry of entries) {
        const result = await apiRequest<{ status?: string }>(
          baseUrl,
          token,
          `/environments/${environment.id}/secrets`,
          {
            method: 'POST',
            body: JSON.stringify(entry),
          },
          ctx.debug,
        )
        results.push(result ?? {})
      }
      const summary = summarizeImportResults(results)
      outputSuccess(ctx.flags, {
        message: `Created ${CONFIG_FILENAME}`,
        data: {
          configPath,
          projectId: project.id,
          environmentId: environment.id,
          imported: summary,
        },
        warnings,
      })
      return
    }
  }

  outputSuccess(ctx.flags, {
    message: `Created ${CONFIG_FILENAME}`,
    data: {
      configPath,
      projectId: project.id,
      environmentId: environment.id,
    },
    warnings,
  })
}
