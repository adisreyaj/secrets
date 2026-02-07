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

Initialize a project + environment and optionally import `.env`:

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
- `secrets init` creates a project/environment and writes `.secretsrc.json` (interactive TUI)
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
