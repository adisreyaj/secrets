# Secrets CLI (Zero-Friction)

## Quick Start

Run any command with injected secrets (no setup required):

```bash
SECRETS_TOKEN=... SECRETS_ENV=dev secrets run -- npm run dev
```

First-time login:

```bash
secrets login
```

`secrets login` now issues a global bootstrap token by default. This allows login with zero existing projects.
It also stores auth locally and immediately continues into `secrets init`, so no manual `export SECRETS_TOKEN` step is required after login.

Initialize by selecting an existing project/environment or creating new ones, then optionally import `.env`:

```bash
secrets init
```

Optional export:

```bash
SECRETS_TOKEN=... SECRETS_ENV=dev secrets export --format dotenv --out .env.local
```

## Environment Variables

- `SECRETS_TOKEN` API token (required)
- `SECRETS_ENV` environment id or slug (required)
- `SECRETS_PROJECT` project id or slug (required when env is a slug)
- `SECRETS_API_BASE_URL` API base URL (default `http://localhost:3001`)

## Commands

- `secrets run -- <cmd>` injects secrets and runs the command
- `secrets export --format dotenv [--out <file>]` writes dotenv output
- `secrets export --dry-run` previews export output size
- `secrets login` opens a browser-based login for CLI tokens (interactive TUI)
- `secrets logout` clears local cached CLI auth
- `secrets init` lets you select existing project/environment or create new ones, then writes `.secretsrc.json` (interactive TUI)
- `secrets list` prints secret keys
- `secrets get <key>` prints a single secret value

## Optional Config File

Create `.secretsrc.json` to avoid flags or env vars (never include tokens):

```json
{
  "apiBaseUrl": "http://localhost:3001",
  "projectSlug": "acme",
  "environmentSlug": "dev"
}
```

If the file exists, CLI will use it. Env vars/flags always override.

## Local Auth Cache

- CLI stores login token at `~/.config/secrets/auth.json` after successful `secrets login`.
- `secrets init`, `secrets run`, `secrets list`, and `secrets get` can use this cached token if `SECRETS_TOKEN` is not set.
- `SECRETS_TOKEN` still takes precedence when explicitly provided.
- `secrets logout` removes this cached auth file.

## Global Bootstrap Token Scope

- Default token from `secrets login` is `global_bootstrap` scope with 30-day TTL.
- It is allowlisted to bootstrap endpoints only:
  - `GET /projects`
  - `POST /projects`
  - `GET /projects/:id/environments`
  - `GET /projects/:id/environments/slug/:slug`
- It cannot perform secret CRUD/export, token/service-account management, invites/team/admin, approvals, or retention/audit settings.
- Use `secrets init` after login to create/connect project and environment context.
- Project-scoped CLI token flow remains supported for existing project-based workflows.

## Local CLI testing

### Fast in-workspace loop (no yalc, no global link)

From this repo root, build SDK + CLI and run the CLI directly:

```bash
pnpm cli:dev:build
pnpm cli:dev --help
```

For repeated runs, either use the script:

```bash
pnpm cli:dev list --debug
```

or a temporary shell alias:

```bash
alias secrets-dev='node /Users/adisreyaj/Desktop/code/secrets/packages/cli/dist/index.mjs'
secrets-dev list --debug
```

For active development in one terminal:

```bash
pnpm cli:dev:watch
```

This watches both `@secrets/sdk` and `@secrets/cli`.
Then run commands in another terminal with `pnpm cli:dev <args>`.

### Global link flow

Build and link the CLI globally:

```bash
pnpm -C packages/cli build
pnpm -C packages/cli link:global
```

In another project, link the CLI:

```bash
pnpm link --global @secrets/cli
secrets --help
```

Unlink when finished:

```bash
pnpm unlink --global @secrets/cli
pnpm -C packages/cli unlink:global
```

## Local testing with yalc (recommended)

From this repo, publish both SDK and CLI to your local yalc store:

```bash
pnpm yalc:publish:all
```

In the other (npm/pnpm) project, add both packages:

```bash
yalc add @secrets/sdk @secrets/cli
npm install
npx secrets --help
```

After local code changes in this repo, push updates:

```bash
pnpm yalc:push:all
```

Then in the other project:

```bash
yalc update @secrets/sdk @secrets/cli
npm install
```

## Debugging Fetch Errors

Enable verbose diagnostics:

```bash
secrets list --debug
SECRETS_DEBUG=1 secrets export --format dotenv
```

Debug logs are written to stderr and redact auth/token-like values.
