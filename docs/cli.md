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
